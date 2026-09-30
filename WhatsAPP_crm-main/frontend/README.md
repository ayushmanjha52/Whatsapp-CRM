# Frontend

React 19 + Vite + Tailwind CSS 4 + TanStack Query + React Router. See the [root README](../README.md) for setup.

```bash
bun install
bun run dev        # http://localhost:3000, proxies /api and /socket.io to VITE_PROXY_TARGET (default :4000)
bun run build      # typecheck + production build → dist/
bun test           # unit tests for CSV import and formatting
```

Layout:

- `src/api`: typed data hooks, one per backend resource.
- `src/lib`: fetch client (CSRF, refresh on 401), realtime cache updates, formatting, CSV parser, chart colors.
- `src/components`: layout, UI kit, template preview.
- `src/pages`: Dashboard, Inbox (`inbox/`), Pipeline, Broadcast (`broadcast/`), Contacts, Templates, Settings, Login, Landing.

Server state lives in TanStack Query. Socket.IO events update or invalidate the cache (`src/lib/realtime.ts`), so every open tab stays in sync without polling.
