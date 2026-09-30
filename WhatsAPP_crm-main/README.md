# WhatsApp CRM

A WhatsApp-native CRM and marketing platform for small businesses and sales teams: a shared real-time inbox, a Kanban sales pipeline, template broadcasts with delivery analytics, and team roles. It is built on the official WhatsApp Cloud API.

## Features

- **Inbox:** real-time chats with delivery and read ticks, media (images, video, audio, documents), search, and Unread / VIP / Archived filters. Each chat has a contact sidebar with notes, tags, a pipeline stage, and reminders. The composer enforces WhatsApp's 24-hour window and offers a template once it has closed.
- **Pipeline:** drag-and-drop Kanban with deal values, per-stage totals, win rate, and time to convert. Adding a deal also puts the contact in the Inbox.
- **Broadcasts:** send approved templates to tag-based lists, with per-contact variables (name, company, custom CSV fields), scheduling, cancellation, live progress, and a sent → delivered → read → replied funnel. Follow-up campaigns can target people who didn't reply or didn't read. Contacts who reply STOP are excluded automatically.
- **Templates:** create templates with variable examples and a live preview, sync from Meta, and receive approval or rejection updates via webhook.
- **Contacts:** a unified list, CSV import with column mapping (quotes, `;` or tab delimiters, custom fields), tags, and bulk broadcast.
- **Dashboard:** first-reply time and its distribution, message volume, pipeline health, broadcast performance, follow-ups due today, and a priority inbox.
- **Team:** Admin and Agent roles, invites by email, and reminders that notify you when they're due.
- **Security:** webhook signature verification, CSRF protection, access tokens encrypted with AES-256-GCM, tenant isolation, row-level security, and rate limits.

Contact visibility follows the PRD rules. Inbound WhatsApp messages appear in the Inbox; contacts reach the Pipeline only when an admin adds them. Imported broadcast leads stay out of the Inbox until they reply.

## Architecture

```
            ┌─────────── web (React SPA, nginx) ───────────┐
Browser ───►│  /api, /socket.io ─► api-gateway (Fastify)   │──► Supabase (Auth, Postgres, Storage)
            │  /webhooks/whatsapp ─► whatsapp-webhook       │
            └───────────────────────────────────────────────┘
Meta ──webhook──► whatsapp-webhook ──► [inbound-events] ──► inbox-service ──► Postgres ──► Redis pub/sub ──► gateway ──► Socket.IO
UI ──send──► api-gateway ──► [outbound-messages] ──► messaging-worker ──► Graph API
Campaigns ──► [campaign-dispatch] ──► campaign-worker ──► [outbound-messages]
Inbound media ──► [media-uploads] ──► media-uploads ──► Supabase Storage
```

| Service | Path | Job |
|---|---|---|
| api-gateway | `BACKEND/services/api-gateway` | REST API, auth, Socket.IO relay |
| whatsapp-webhook | `BACKEND/services/whatsapp-webhook` | Verifies and enqueues Meta webhooks |
| inbox-service | `BACKEND/services/inbox-service` | Stores inbound messages, delivery statuses, template status |
| messaging-worker | `BACKEND/services/messaging-worker` | Sends via the Graph API; retries only transient errors; rate-limited |
| campaign-worker | `BACKEND/services/campaign-worker` | Expands campaigns into messages, tracks completion, fires reminders |
| media-uploads | `BACKEND/services/media-uploads` | Copies inbound media to Supabase Storage |

**Stack:** Bun, TypeScript, Fastify 5, BullMQ + Redis, Supabase (Postgres, Auth, Storage), Socket.IO, React 19, Vite, Tailwind CSS 4, TanStack Query, and Recharts.

Message ingestion and delivery statuses run in Postgres functions (`migrations/0017_crm_core.sql`). They are idempotent under webhook retries, never move a status backwards (e.g. read → delivered), and replay statuses that arrive before the send is recorded.

## Getting started

### 1. Prerequisites

- [Bun](https://bun.sh) 1.3+
- A [Supabase](https://supabase.com) project
- Redis 7 (`docker run -p 6379:6379 redis:7-alpine`, or a managed Redis)
- A Meta app with the WhatsApp product. A test number is fine to start.

### 2. Configure

```bash
cd BACKEND
cp .env.example .env        # fill in Supabase keys, DATA_ENCRYPTION_KEY, Meta settings
bun install
cd ../frontend
bun install
```

Generate the encryption key with `openssl rand -hex 32`.

### 3. Database

```bash
cd BACKEND
# DATABASE_URL = Supabase → Project Settings → Database → connection string (URI)
DATABASE_URL="postgresql://…" bun run migrate
```

If your database already has migrations 0001–0016 (applied by hand earlier), mark them once and then apply the rest:

```bash
DATABASE_URL="postgresql://…" bun run migrate --baseline 0016
DATABASE_URL="postgresql://…" bun run migrate
```

You can also paste `migrations/0017_crm_core.sql` into the Supabase SQL editor.

### 4. Run

```bash
cd BACKEND  && bun run dev:all     # gateway :4000, webhook :4001 and all workers
cd frontend && bun run dev         # http://localhost:3000 (proxies the API)
```

Sign up. The first account becomes the admin of its workspace. Then open **Settings → WhatsApp**.

### 5. Connect WhatsApp

You have two options:

- **Permanent token (quickest):** in Meta Business Settings → System users, create a token with `whatsapp_business_messaging` and `whatsapp_business_management`. Paste your WABA ID, phone number ID, and the token.
- **Connect with Facebook (OAuth):** set `META_APP_ID`, `META_APP_SECRET`, and `OAUTH_REDIRECT_URI` (e.g. `https://your-domain/auth/whatsapp/callback`, also registered in the Meta app).

Either way, the app subscribes to the WABA's webhooks and syncs your templates.

Then set up the webhook in the Meta app (WhatsApp → Configuration):

- **Callback URL:** `https://your-domain/webhooks/whatsapp`. For local development: `ngrok http 4001`, then `https://<id>.ngrok.app/webhooks/whatsapp`.
- **Verify token:** the value of `WHATSAPP_VERIFY_TOKEN`.
- **Subscribed fields:** `messages` and `message_template_status_update`.

To test the inbound pipeline without Meta:

```bash
cd BACKEND
bun run simulate:webhook --phone-number-id <your id> --from 15551234567 --name "Jane" --text "Hi there"
```

## Deploy

```bash
cd BACKEND
cp .env.example .env    # production values: COOKIE_SECURE=1, FRONTEND_BASE_URL, PUBLIC_WEBHOOK_URL…
docker compose up -d --build
# → http://localhost:8080 (put HTTPS in front of it)
```

nginx serves the SPA and proxies `/api`, `/socket.io`, `/auth/whatsapp`, and `/webhooks/whatsapp`. Browser and API stay on one origin, which the `SameSite=Strict` session cookies require. Redis runs with AOF persistence so queued messages survive restarts. You can scale `messaging-worker` and `inbox-service` horizontally.

## Testing

```bash
cd BACKEND  && bun test && bun run typecheck   # 59 tests: SQL functions on embedded Postgres, domain logic, HTTP security
cd frontend && bun test && bun run build       # CSV import and formatting tests; typecheck + production build
cd BACKEND  && EMAIL=… PASSWORD=… bun run smoke   # end-to-end against a running stack with real Supabase
```

`bun run tap` prints your workspace's realtime events. The queue dashboard is at `/admin/queues` for emails listed in `ADMIN_EMAILS`.

## Docs

- API reference: [BACKEND/docs/api.md](BACKEND/docs/api.md)
- Product requirements: [prd.md](prd.md)
- WhatsApp Cloud API notes: [DOCS/whatsapp-cloud-api.md](DOCS/whatsapp-cloud-api.md)

## Not included yet

- Stripe billing and plan limits.
- AI reply suggestions.
- Sending templates whose URL buttons contain variables.
- Creating templates with media headers. Sending approved ones works.
