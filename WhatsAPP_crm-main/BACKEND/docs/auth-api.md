# Auth API Gateway

## Overview
- Identity provider: Supabase Auth
- Cookies: `sb_access_token` (HttpOnly, Secure, SameSite=Strict), `sb_refresh_token` (HttpOnly, Secure, SameSite=Strict), `csrf_token` (Secure, SameSite=Strict)
- Headers:
  - `Authorization: Bearer <sb_access_token>` for protected endpoints
  - `x-csrf-token` or `csrf-token`: must match `csrf_token` cookie for state-changing endpoints
  - Optional: `ngrok-skip-browser-warning: true` when using ngrok

## Endpoints

### POST /auth/signup
- Body: `{ "email": string, "password": string, "name": string }`
- Headers: none
- Response: `201 { success: true, user: { id, email, name }, message: "account_created" }`
- Sets cookies: `sb_access_token`, `sb_refresh_token`, `csrf_token`

### POST /auth/login
- Body: `{ "email": string, "password": string }`
- Headers: none
- Response: `200 { success: true, user: { id, email, name }, message: "login_ok" }`
- Sets cookies: `sb_access_token`, `sb_refresh_token`, `csrf_token`

### POST /auth/logout
- Headers: `Authorization: Bearer <sb_access_token>`, `x-csrf-token: <csrf_token>`
- Body: none
- Response: `200 { success: true, message: "logout_ok" }`
- Clears cookies: `sb_access_token`, `sb_refresh_token`, `csrf_token`

### POST /auth/refresh
- Headers: `x-csrf-token: <csrf_token>`
- Body: none
- Response: `200 { success: true, message: "refresh_ok" }`
- Requires cookie: `sb_refresh_token`; rotates access/refresh tokens and updates DB

### GET /auth/me
- Headers: `Authorization: Bearer <sb_access_token>` or `sb_access_token` cookie
- Response: `200 { id, email }`

### POST /messages/send
- Headers: `Authorization: Bearer <sb_access_token>`
- Body: `{ "to": string, "payload": any, "phone_number_id"?: string }`
- Response: `200 { enqueued: true }`

### POST /events/publish
- Headers: `Authorization: Bearer <sb_access_token>`
- Body: `{ "channel": string, "data": any }`
- Response: `200 { published: true }`

## CSRF in Postman
- Pre-request Script: `pm.request.headers.add({ key: 'x-csrf-token', value: pm.cookies.get('csrf_token') })`

## Example cURL
```bash
curl -X POST https://<host>/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "x-csrf-token: <csrf_cookie_value>"
```

## WhatsApp Embedded Signup

### POST /api/whatsapp/complete-onboarding
- Headers: `Authorization: Bearer <sb_access_token>`, `x-csrf-token: <csrf_token>`
- Body: `{ "code": string, "waba_id"?: string }`
- Response: `200 { success: true, waba_id, phone_numbers_count }`
- Side effects:
  - Exchanges OAuth `code` for long‑lived token
  - Verifies required scopes
  - If `waba_id` omitted, discovers via `GET /me/businesses` then `GET /{BUSINESS_ID}/owned_whatsapp_business_accounts`
  - Fetches phone numbers for WABA and stores credentials per tenant in `whatsapp_credentials`
