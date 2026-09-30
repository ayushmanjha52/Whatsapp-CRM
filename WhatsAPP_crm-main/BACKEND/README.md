# Backend

Bun + Fastify + BullMQ services on top of Supabase and Redis. See the [root README](../README.md) for setup and [docs/api.md](docs/api.md) for the API.

```bash
cp .env.example .env
bun install
DATABASE_URL=… bun run migrate
bun run dev:all          # gateway, webhook, inbox, worker, media, campaigns (watch mode)
bun test                 # unit + SQL + HTTP tests (no external services needed)
bun run typecheck
```

| Script | What it runs |
|---|---|
| `gateway` / `dev:gateway` | REST API + Socket.IO on `GATEWAY_PORT` (4000) |
| `webhook` | Meta webhook receiver on `WEBHOOK_PORT` (4001) |
| `inbox` | Inbound messages, delivery statuses, template status |
| `worker` | Outbound sends |
| `campaigns` | Campaign dispatch + completion, task reminders |
| `media` | Inbound media → Supabase Storage |
| `migrate` | Applies `migrations/*.sql` (`--status`, `--baseline <prefix>`) |
| `smoke` | End-to-end checks against a running gateway (`EMAIL`, `PASSWORD`) |
| `simulate:webhook` | Sends a signed fake inbound message or status |
| `tap` | Prints realtime events for an account |

Layout:

- `src/common`: env, Supabase clients, Redis/BullMQ singletons, realtime publish, storage.
- `src/http`: auth/tenant resolution, CSRF, roles, errors.
- `src/whatsapp`: Graph API client, webhook normalizer, templates, message previews, signature check.
- `src/crm`: contacts, outbound queueing, campaign engine.
- `services/*`: one entry point per process.
- `test/`: `bun test` suites. `test/db` runs every migration on embedded Postgres (PGlite).
