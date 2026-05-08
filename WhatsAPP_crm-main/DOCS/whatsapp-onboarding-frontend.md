# WhatsApp Frontend Onboarding Guide

## Prerequisites
- Environment variables must be configured on the backend:
  - `META_APP_ID`, `META_APP_SECRET` and optionally `META_APP_ACCESS_TOKEN`
  - `OAUTH_REDIRECT_URI` must be HTTPS and whitelisted in your Meta app
  - `DATA_ENCRYPTION_KEY` must be 32 bytes (UTF‑8 string, base64, or 64‑char hex)
- User authentication uses Supabase; frontend must log in first to obtain cookies:
  - `sb_access_token` (httpOnly) and `sb_refresh_token` (httpOnly)
  - `csrf_token` (non‑httpOnly) used for CSRF header on POSTs

## UX Flow
- User clicks Connect to WhatsApp.
- Frontend calls `GET /api/whatsapp/oauth-url` and opens the returned `url` in a new tab/window.
- User completes Meta consent. Meta redirects to `OAUTH_REDIRECT_URI` (`GET /auth/whatsapp/callback`).
- Frontend initiates completion:
  - Option A: The callback page auto‑posts to `POST /api/whatsapp/complete-onboarding` when `csrf_token` and `waba_id` are present.
  - Option B{Recommended}: Frontend reads `code` from the callback URL and posts it to the backend with the CSRF header.
- Backend exchanges the code for a long‑lived business token, verifies scopes, discovers `waba_id`, fetches phone numbers, and saves credentials.
- Frontend refreshes UI by calling `GET /api/whatsapp/credentials` and `GET /api/whatsapp/numbers`.

## HTTP Contracts

### GET `/api/whatsapp/oauth-url`
- Auth: Optional (will set `wa_state` cookie regardless).
- Response:
```
{ "url": "https://www.facebook.com/v24.0/dialog/oauth?...&state=<hex>" }
```
- Cookies set: `wa_state=<hex>; SameSite=Strict; Secure; Path=/`

### GET `/auth/whatsapp/callback`
- Query params: `code`, `state`, optional `waba_id`
- Returns an HTML page displaying code and state. If `csrf_token` + `waba_id` are present, it auto‑calls completion.

### POST `/api/whatsapp/complete-onboarding`
- Auth: Required (Supabase user).
- CSRF: Required; header `x-csrf-token: <csrf_token>`.
- Body:
```
{ "code": "<meta_oauth_code>", "waba_id": "<optional>" }
```
- Success:
```
{ "success": true, "waba_id": "<id>", "phone_numbers_count": 1 }
```
- Errors: `oauth_exchange_failed`, `long_lived_exchange_failed`, `debug_token_failed`, `missing_scopes`, `waba_not_found`, `phone_numbers_fetch_failed`, `store_failed`, `onboarding_failed`.

### GET `/api/whatsapp/credentials`
- Auth: Required.
- Returns saved credentials per phone number including health fields:
```
{
  "credentials": [
    {
      "tenant_id": "<uuid>",
      "waba_id": "<id>",
      "phone_number_id": "<id>",
      "display_phone_number": "+1 555 555 0000",
      "verified_name": "Acme",
      "status": "CONNECTED",
      "quality_rating": "GREEN",
      "account_mode": "LIVE",
      "token_expires_at": "2025-02-01T00:00:00Z",
      "scopes": ["whatsapp_business_management","whatsapp_business_messaging"],
      "last_scope_check_at": "2025-12-03T10:00:00Z",
      "data_access_expires_at": "2026-01-01T00:00:00Z",
      "default_sender": true
    }
  ]
}
```

### GET `/api/whatsapp/numbers`
- Auth: Required.
- Returns number metadata and default sender flag:
```
{ "numbers": [{ "phone_number_id": "<id>", "display_phone_number": "...", "verified_name": "...", "status": "CONNECTED", "quality_rating": "GREEN", "account_mode": "LIVE", "default_sender": true }] }
```

### GET `/api/whatsapp/templates`
- Auth: Required.
- Returns templates stored in DB:
```
{ "templates": [{ "id": 1, "waba_id": "<id>", "name": "order_update", "language": "en", "category": "UTILITY", "status": "APPROVED" }] }
```

### GET `/api/whatsapp/verification`
- Auth: Required.
- Returns business verification status for the Business owning the WABA:
```
{ "verification": { "name": "Acme Inc.", "verification_status": "verified" } }
```

### GET `/api/whatsapp/analytics/messages`
- Auth: Required.
- Aggregates recent message events from `events` table:
```
{ "counts": { "message_sent": 123, "message_delivered": 118, "message_read": 97, "message_failed": 3 } }
```

### GET `/api/whatsapp/analytics/templates`
- Auth: Required.
- Returns template status distribution and list:
```
{ "status_counts": { "APPROVED": 12, "REJECTED": 2 }, "templates": [ ... ] }
```

### GET `/api/whatsapp/webhook/status`
- Auth: Required.
- Returns stored webhook settings:
```
{ "status": { "verify_token": "...", "callback_url": "https://.../webhook", "subscribed_at": "...", "last_signature_valid_at": "..." } }
```

### POST `/api/whatsapp/webhook/config`
- Auth: Required; CSRF required.
- Body:
```
{ "verify_token": "<string>", "callback_url": "https://..." }
```
- Success: `{ "success": true }`

## Frontend Integration Details

- Authentication
  - Call `POST /auth/login` to set cookies; then read `csrf_token` from `document.cookie`.
  - Use `x-csrf-token` header for protected POSTs.
- Connect button
  - `fetch('/api/whatsapp/oauth-url').then(r=>r.json()).then(({url})=>window.open(url,'_blank'))`.
  - After consent, the browser hits `/auth/whatsapp/callback`; either let the page auto‑complete or capture `code` from the URL and call completion yourself.
- Refresh UI
  - On completion success, call `GET /api/whatsapp/credentials` and `GET /api/whatsapp/numbers` and update components.
  - Optionally poll every N minutes; or refresh on page focus.
- Sending messages
  - Use `POST /messages/send` with `{ to, payload, phone_number_id }` once a default sender is available.
- Error handling
  - Show actionable messages for onboarding errors listed above; offer retry.
  - If `missing_scopes`, instruct the user to re‑consent with full permissions.

## Database Writing (Backend Behavior)

- `whatsapp_credentials` rows are upserted per `(tenant_id, phone_number_id)` with:
  - Token fields: `access_token_encrypted`, `token_expires_at`, `scopes[]`, `last_scope_check_at`, `data_access_expires_at`
  - Number fields: `display_phone_number`, `verified_name`, `status`, `quality_rating`, `account_mode`
  - Defaults: one row per tenant has `default_sender=true` (enforced via partial unique index)
- `whatsapp_webhook_settings` stores verify token and callback URL for audit.
- Optional `whatsapp_analytics_snapshots` stores cached analytics payloads by `kind` and `time_window`.

## Environment & Config

- Required
  - `META_APP_ID`, `META_APP_SECRET`
  - `OAUTH_REDIRECT_URI` (must match Meta app whitelist)
  - `DATA_ENCRYPTION_KEY` (32 bytes)
- Optional
  - `META_APP_ACCESS_TOKEN` for `debug_token`

## Example UI Sequence (Pseudocode)

```
// Login
await fetch('/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password }) })

// Get CSRF
const csrf = document.cookie.split('; ').find(s=>s.startsWith('csrf_token='))?.split('=')[1]

// Connect button
const { url } = await (await fetch('/api/whatsapp/oauth-url')).json()
window.open(url, '_blank')

// After redirect (Option B manual): read code then complete
await fetch('/api/whatsapp/complete-onboarding', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ code }) })

// Refresh UI
const creds = await (await fetch('/api/whatsapp/credentials')).json()
const numbers = await (await fetch('/api/whatsapp/numbers')).json()
```

## Testing Checklist

- Login sets cookies and CSRF token.
- OAuth URL opens and redirects to callback.
- Completion returns success and DB rows exist for each number.
- `GET /api/whatsapp/credentials` shows `default_sender` and health fields.
- `GET /api/whatsapp/verification` shows the business status.
- `POST /messages/send` enqueues and status webhooks update UI.
