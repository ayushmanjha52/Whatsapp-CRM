# API reference

Base path: `/api`. All responses are JSON. Errors look like:

```json
{ "error": "window_closed", "message": "More than 24 hours have passed…", "details": {} }
```

## Authentication

- Session cookies: `sb_access_token` and `sb_refresh_token` (HttpOnly, SameSite=Strict), plus `csrf_token` (readable by JS).
- `Authorization: Bearer <supabase access token>` also works for scripts.
- **CSRF:** every `POST`/`PATCH`/`PUT`/`DELETE` must send `x-csrf-token` equal to the `csrf_token` cookie.
- On `401`, call `POST /api/auth/refresh` once, then retry.
- **Roles:** `admin` or `agent`. "Admin" below means agents get `403 admin_only`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{ name, email, password }` → `{ user }`, or `{ needs_confirmation: true }` when email confirmation is on |
| POST | `/auth/login` | `{ email, password }` → `{ user }` |
| GET | `/auth/session` | Current user `{ id, email, name, role, tenant_id, tenant_name }`; issues a CSRF cookie if missing |
| POST | `/auth/refresh` | Rotates session cookies |
| POST | `/auth/logout` | |
| POST | `/auth/recover` | `{ email }` → always `{ success: true }` |
| PATCH | `/auth/profile` | `{ name }` |
| POST | `/auth/password` | `{ current_password, new_password }` |

Credential endpoints are limited to 10 requests/minute; everything else to 600/minute per user.

## Inbox

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations?filter=all\|unread\|vip\|archived&q=&offset=&limit=` | `{ conversations: Contact[], has_more, counts: { unread } }` |
| GET | `/conversations/:waId/messages?before=<iso>&limit=50` | Oldest → newest page, `{ messages, has_more }` |
| POST | `/conversations/:waId/messages` | Send (see below). `202 { message }` with `status: "queued"` |
| POST | `/conversations/:waId/read` | Clears unread and sends a read receipt to WhatsApp |
| POST | `/conversations/:waId/archive` | `{ archived: boolean }` |
| DELETE | `/conversations/:waId` | Admin. Deletes the chat history and hides the chat; keeps the contact and deal |

Send bodies:

```jsonc
{ "type": "text", "text": "Hi!" }                                   // only inside the 24h window
{ "type": "media", "kind": "image", "url": "https://…", "caption": "…" } // url from POST /media
{ "type": "template", "template_name": "order_update", "language": "en_US",
  "variables": { "body.1": "Jane" }, "header_media_url": "https://…" }   // any time
```

Free-form messages outside WhatsApp's 24-hour customer service window fail with `422 window_closed`. Use a template instead.

## Contacts

| Method | Path | Notes |
|---|---|---|
| GET | `/contacts?q=&tag=&audience=all\|inbox\|broadcast_only\|pipeline&page=&page_size=` | `{ contacts, total }` |
| GET | `/contacts/tags` | `{ tags: [{ name, count }] }` |
| GET | `/contacts/fields` | Custom field keys in use |
| POST | `/contacts` | `{ name, phone, email?, company?, tags?, notes?, add_to_inbox? }`; `409 contact_exists` returns `details.wa_id` |
| GET / PATCH / DELETE | `/contacts/:waId` | PATCH: `{ name?, email?, company?, tags?, notes?, custom_fields? }`. DELETE (admin) removes everything |
| POST | `/contacts/import` | Admin. `{ contacts: [{ phone, name?, email?, company?, tags?, custom_fields? }], tags? }` → `{ inserted, updated, invalid }` |

Phone numbers must include a country code. They are stored as `wa_id` (digits only).

## Pipeline

| Method | Path | Notes |
|---|---|---|
| GET | `/pipeline` | `{ stages, deals }`; default stages are created on first use |
| POST | `/pipeline/deals` | Admin. `{ wa_id }` for an existing contact, or `{ name, phone, company? }` for a new one; plus `value?, title?, notes?, tags?, stage_id?` |
| PATCH | `/pipeline/deals/:id` | `{ stage_id?, notes? }` for everyone; `value`, `title`, `tags` are admin only. Moving to the last stage sets `converted_at` |
| DELETE | `/pipeline/deals/:id` | Admin |

## Templates (admin for writes)

| Method | Path | Notes |
|---|---|---|
| GET | `/templates` | Local mirror, including a parsed `shape` (variables, header format, buttons) |
| POST | `/templates/sync` | Pull every template from Meta |
| POST | `/templates` | `{ name, language, category, body, header_text? \| header_media?: { format: IMAGE\|VIDEO\|DOCUMENT, url }, footer?, examples?, buttons? }`. `header_media.url` must be a file uploaded via `POST /media`; it goes to Meta's resumable upload API for the review sample. A URL button may end in `{{1}}`; give its example as `examples["button.<index>"]`. Submitted to Meta for review |
| DELETE | `/templates/:name` | Deletes all languages on Meta |

Status changes (APPROVED/REJECTED/…) arrive through the `message_template_status_update` webhook.

## Campaigns (admin for writes)

| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns` | With `stats: { total, pending, sent, delivered, read, failed, replied, reply_rate, read_rate }` |
| GET | `/campaigns/:id?status=&page=` | Campaign, recipients page, follow-ups |
| POST | `/campaigns/audience-preview` | `{ contact_ids? \| tags? \| audience? }` → `{ count }` |
| POST | `/campaigns` | `{ name, template_name, template_language, variables, header_media_url?, audience, scheduled_at?, send }` |
| POST | `/campaigns/:id/follow-up` | Same body plus `segment: not_replied\|not_read\|failed\|replied` |
| POST | `/campaigns/:id/send` | Send or schedule a draft |
| POST | `/campaigns/:id/cancel` | Stops anything not yet sent |
| DELETE | `/campaigns/:id` | Not while scheduled or sending |

`variables` maps each template slot to a source:

```json
{ "body.1": { "source": "field", "field": "first_name", "fallback": "there" },
  "body.2": { "source": "static", "value": "20%" } }
```

Keys are `header.<var>`, `body.<var>` and `button.<index>` (the value that replaces a link button's trailing `{{1}}`). Available fields: `name`, `first_name`, `phone`, `email`, `company`, `custom.<key>`. Contacts who replied STOP are always excluded. A reply within 7 days is attributed to the most recent campaign message.

## Tasks, dashboard, team, media, WhatsApp

| Method | Path | Notes |
|---|---|---|
| GET | `/tasks?status=open\|done\|all&wa_id=&due_before=` | |
| POST / PATCH / DELETE | `/tasks[/:id]` | `{ title, due_at, wa_id? }`, `{ completed }`. A `task.due` realtime event fires at `due_at` |
| GET | `/dashboard?days=7&tz=Europe/Berlin` | KPIs, daily volume, first-reply buckets, pipeline, broadcast totals, priority inbox, tasks due today |
| GET | `/team` | |
| POST | `/team/invite` | Admin. `{ email, role }`. Accepted automatically when that email signs up or logs in |
| PATCH / DELETE | `/team/:id` | Admin. Keeps at least one admin; the owner can't be removed |
| POST | `/media` | multipart `file` → `{ url, kind, mime_type, filename, size }`. WhatsApp limits: image 5 MB (JPEG/PNG), video/audio 16 MB, document 100 MB |
| GET | `/whatsapp/status` | Connected numbers, webhook URL, verify token (admin only), OAuth availability |
| GET | `/whatsapp/oauth-url` | Admin. Meta login URL (state stored in a cookie) |
| POST | `/whatsapp/complete-onboarding` | Admin. `{ code, state }` after the OAuth redirect |
| POST | `/whatsapp/connect-manual` | Admin. `{ waba_id, phone_number_id, access_token }` (System User token) |
| POST | `/whatsapp/default-sender` | Admin. `{ phone_number_id }` |
| POST | `/whatsapp/disconnect` | Admin |

Connecting a number stores the token encrypted (AES-256-GCM), subscribes the app to the WABA's webhooks, and syncs templates.

## Billing

Active only when `STRIPE_SECRET_KEY` is set; otherwise every workspace has the Business feature set.

| Method | Path | Notes |
|---|---|---|
| GET | `/billing` | `{ enabled, plan, status, current_period_end, cancel_at_period_end, usage: { conversations, seats }, plans }` |
| POST | `/billing/checkout` | Admin. `{ plan: growth\|business }` → `{ url }` (Stripe Checkout) |
| POST | `/billing/portal` | Admin. → `{ url }` (Stripe customer portal: change plan, cancel, invoices) |

Limits return `402 upgrade_required` with `details.plan` naming the plan needed:

- Starter: 100 conversations/month (new chats only; replies in counted chats and inbound messages are never blocked), 1 seat, no broadcasts, no AI.
- Growth: unlimited conversations, 3 seats, broadcasts.
- Business: unlimited seats, AI suggestions.

`POST /webhooks/stripe` (public, signature-verified, idempotent per event) syncs the plan from the subscription's price (`STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_BUSINESS`).

## AI

| Method | Path | Notes |
|---|---|---|
| GET | `/ai/status` | `{ configured, available }` |
| POST | `/conversations/:waId/suggest-replies` | → `{ suggestions: [{ text, label }] }` (three drafts). `422 ai_not_configured` without `ANTHROPIC_API_KEY`, `402` below Business, `429` past `AI_RATE_LIMIT_PER_MINUTE`, `422 ai_declined` on a model refusal |

## Realtime

Socket.IO at `/socket.io/`, authenticated by the session cookie. Every connection joins its workspace room and receives `event` messages:

| `event` | Payload |
|---|---|
| `message.created` | `{ wa_id, message }` |
| `message.updated` | `{ wa_id, message: { id, status, error?, media… } }` |
| `conversation.updated` / `contact.updated` | `{ wa_id?, deleted? }` |
| `deal.created` / `deal.updated` / `deal.deleted` | `{ deal }` / `{ deal_id }` |
| `campaign.updated` | `{ campaign_id }` (throttled to one every 2 s per campaign) |
| `template.updated`, `task.updated` | |
| `task.due` | `{ task }` |

## Webhook service

`GET /webhooks/whatsapp` answers Meta's verification handshake. `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` against the app secret, enqueues the payload, and returns 200 immediately.
