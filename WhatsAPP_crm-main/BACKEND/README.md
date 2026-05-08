# backend

- Install dependencies: `bun install`
- Copy env: `cp BACKEND/.env.example BACKEND/.env` and fill values

Services
- `gateway`: `bun run services/api-gateway/index.ts`
- `webhook`: `bun run services/whatsapp-webhook/index.ts`
- `worker`: `bun run services/messaging-worker/index.ts`
- `inbox`: `bun run services/inbox-service/index.ts`

Migrations
- Apply `BACKEND/migrations/0001_init.sql` to Supabase Postgres

Webhook testing
- Expose `webhook` at HTTPS using ngrok and register callback in Meta App Dashboard
- Use sample payloads from `DOCS/whatsapp-cloud-api.md` to simulate inbound events
