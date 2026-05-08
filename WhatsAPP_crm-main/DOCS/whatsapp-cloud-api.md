# WhatsApp Business Cloud API Playbook

> **Scope.** Everything a SaaS CRM or automation platform needs to integrate Meta’s WhatsApp Business Cloud API: onboarding, auth, messaging, flows, payments, pricing, limits, HA, and troubleshooting. All references link back to the official [Meta developers documentation](https://developers.facebook.com/docs/whatsapp/).

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Authentication & Access](#authentication--access)
3. [Backend Integration Blueprint](#backend-integration-blueprint)
4. [Onboarding & Embedded Signup](#onboarding--embedded-signup)
5. [Phone Numbers & Business Assets](#phone-numbers--business-assets)
6. [Messaging Fundamentals](#messaging-fundamentals)
7. [Message Types](#message-types)
8. [Media Management](#media-management)
9. [Template Lifecycle](#template-lifecycle)
10. [Interactive Flows & Extensions](#interactive-flows--extensions)
11. [Payments & Checkout Buttons](#payments--checkout-buttons)
12. [Webhooks & Event Handling](#webhooks--event-handling)
13. [Pricing, Limits & Throughput](#pricing-limits--throughput)
14. [Operations, Reliability & HA](#operations-reliability--ha)
15. [Error Handling & Troubleshooting](#error-handling--troubleshooting)
16. [Reference Appendix](#reference-appendix)

---

## Platform Overview

| Concept | Details |
| --- | --- |
| **Base host** | `https://graph.facebook.com/v{version}` – production Graph API surface for Cloud API calls. |
| **Primary resources** | `/{PHONE_NUMBER_ID}/messages`, `/{PHONE_NUMBER_ID}/media`, `/{WABA_ID}/message_templates`, Flows endpoints, phone-number configuration endpoints. |
| **Products** | WhatsApp Business Cloud API (hosted by Meta), WhatsApp Business App, Embedded Signup, Payments/Checkout, Flows extensions. |
| **Versioning** | Latest GA versions (v24.0 at time of docs) – upgrade by swapping version segment in the URL. |
| **Messaging model** | Per-message pricing (PMP) replacing conversation-based pricing July 1, 2025. Messaging limits still enforced per phone number. |
| **Webhook object** | All inbound notifications use `object: "whatsapp_business_account"` with entries/changes arrays. |

### Base call anatomy

```
POST https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {TENANT_ACCESS_TOKEN}
Content-Type: application/json
```

Every request must include the tenant token (user/system) that owns the WABA and phone number. For SaaS, store a per-tenant token produced via Embedded Signup or a system user.

---

## Authentication & Access

### Token types & scopes

- **User access tokens** (short-lived) returned from Embedded Signup. Exchange for **long-lived tokens** and renew every ~60 days.
- **System user tokens** (Business Manager) for internal automations. Create via Meta Business Suite.
- Required scopes: `whatsapp_business_management` and `whatsapp_business_messaging`.

### Inspecting scopes

Use the Graph `debug_token` endpoint to confirm scopes whenever a tenant connects:

```bash
curl "https://graph.facebook.com/v24.0/debug_token?input_token={TENANT_TOKEN}" \
  -H "Authorization: Bearer {APP_ACCESS_TOKEN}"
```

Response highlights include `is_valid`, `scopes`, `data_access_expires_at`, and `user_id`.

### Identity protection & two-step verification

- Enable identity enforcement per phone number:

```bash
curl "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/settings" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{ "user_identity_change": { "enable_identity_key_check": true } }'
```

- Set or rotate the two-step verification PIN via `POST /{PHONE_NUMBER_ID}` with `{ "pin": "123456" }`.

### Certificate pinning for webhooks

If hosting webhook servers with custom certificates, upload your CA via `POST /certificates/webhooks/ca` supplying a PEM chain. Meta requires valid chains; self-signed certs are rejected.

---

## Backend Integration Blueprint

This section is designed for backend agents setting up infrastructure quickly.

### Environment contract

| Var | Purpose |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | Graph node for sending messages. |
| `WHATSAPP_ACCESS_TOKEN` | Tenant/system token with messaging scopes. |
| `WHATSAPP_VERIFY_TOKEN` | Arbitrary string you configure in App Dashboard for webhook verification. |
| `WHATSAPP_APP_SECRET` | App secret used to validate `X-Hub-Signature-256`. |

Store per-tenant tokens in your DB with: tenant ID, `waba_id`, phone numbers, long-lived token, expiry, and granted scopes (from `debug_token`).

### Express/Node scaffold

```ts
import crypto from "crypto";
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ verify: (req, _res, buf) => (req.rawBody = buf) }));

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;

app.get("/webhooks/whatsapp", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

function validateSignature(req) {
  const received = req.header("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

app.post("/webhooks/whatsapp", (req, res) => {
  if (!validateSignature(req)) return res.sendStatus(401);
  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { messages = [], statuses = [] } = change.value ?? {};
      messages.forEach(handleInboundMessage);
      statuses.forEach(handleStatusUpdate);
    }
  }
  res.sendStatus(200);
});

async function sendText(to, body) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };
  const resp = await fetch(
    `https://graph.facebook.com/v24.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`WhatsApp send failed ${resp.status}: ${err}`);
  }
  return resp.json();
}
```

Use similar patterns in other stacks (FastAPI, NestJS, Go, etc.)—critical pieces are validating the webhook signature, echoing the challenge, and wrapping Graph calls with retries/logging.

### Handler best practices

- Persist every `wamid` and related `conversation.id` as soon as you receive them to correlate statuses (`sent`, `delivered`, `read`, `failed`).
- Implement idempotent processing (e.g., message table keyed by `wamid`) since WhatsApp may retry payloads for up to 36 hours.
- Use a job queue for outbound sends. Backoff on 429/5xx responses and inspect `error.code` for actionable items (e.g., template rejection vs throttling).
- Provide a tenant abstraction so each API call injects the correct `phone_number_id` + token. This doc’s [Reference Appendix](#reference-appendix) lists every endpoint you’ll touch.

### Testing locally

1. Expose your server via ngrok and register the HTTPS URL + verify token in the Meta App Dashboard (WhatsApp > Configuration).
2. Trigger `GET {callback}` verification.
3. Use the Sample Webhook payloads below to craft mock requests for unit tests (e.g., status updates, quick replies, list replies).

---

## Onboarding & Embedded Signup

Embedded Signup lets each customer connect their WABA without leaving your SaaS. This is the **official Meta flow** for SaaS platforms to onboard customers programmatically.

### Prerequisites

1. **Meta App Setup:**
   - Create a Meta App at https://developers.facebook.com/
   - Add the **WhatsApp** product
   - Enable **Embedded Signup** in App Dashboard
   - Generate a **Configuration ID** (`config_id`) for Embedded Signup
   - Configure OAuth redirect URI (e.g., `https://your-saas.com/auth/whatsapp/callback`)
   - Request App Review for `whatsapp_business_management` and `whatsapp_business_messaging` permissions

2. **Business Manager Setup (for credit line sharing):**
   - Create a Business Manager account
   - Set up an Extended Credit Line (if you'll subsidize customer messaging)
   - Create System Users with appropriate roles (Admin or Financial Editor)

### Frontend: Launch Embedded Signup Dialog

Use Meta's Embedded Signup JavaScript SDK to launch the onboarding dialog:

```javascript
// Load Meta Embedded Signup SDK (add to your HTML)
<script src="https://www.facebook.com/embedded_signup/sdk.js"></script>

// Launch Embedded Signup when user clicks "Connect WhatsApp"
function launchWhatsAppOnboarding() {
  const config = {
    config_id: "<YOUR_EMBEDDED_SIGNUP_CONFIG_ID>",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3"
    }
  };

  // Register callback handler
  window.addEventListener("message", handleEmbeddedSignupCallback, false);

  // Launch the dialog
  FB.EmbeddedSignup.init(config, (response) => {
    if (response.status === "connected") {
      console.log("User connected:", response);
    } else if (response.status === "not_authorized") {
      console.error("User not authorized");
    }
  });
}

// Handle callback from Embedded Signup
function handleEmbeddedSignupCallback(event) {
  if (event.origin !== "https://www.facebook.com") return;

  const { type, event: eventType, data, code, version } = event.data;

  if (type === "WA_EMBEDDED_SIGNUP" && eventType === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    // Send code and WABA ID to your backend
    fetch("/api/whatsapp/complete-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        waba_id: data.waba_id,
        version: version
      })
    })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        // Redirect to success page or update UI
        window.location.href = "/dashboard/whatsapp/connected";
      }
    });
  }
}
```

### Backend: Handle OAuth Code Exchange

When Embedded Signup completes, your backend receives the OAuth `code`. Exchange it for tokens:

```python
# Python/Flask example
import requests
from flask import request, jsonify

@app.route("/api/whatsapp/complete-onboarding", methods=["POST"])  # Mirrors Fastify gateway endpoint
def complete_onboarding():
    data = request.json
    code = data.get("code")
    waba_id = data.get("waba_id")

    # Step 1: Exchange code for short-lived access token
    token_response = requests.get(
        "https://graph.facebook.com/v24.0/oauth/access_token",
        params={
            "client_id": os.getenv("META_APP_ID"),
            "client_secret": os.getenv("META_APP_SECRET"),
            "redirect_uri": os.getenv("OAUTH_REDIRECT_URI"),
            "code": code
        }
    )
    token_data = token_response.json()
    short_lived_token = token_data["access_token"]

    # Step 2: Exchange short-lived token for long-lived token (60 days)
    long_lived_response = requests.get(
        "https://graph.facebook.com/v24.0/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": os.getenv("META_APP_ID"),
            "client_secret": os.getenv("META_APP_SECRET"),
            "fb_exchange_token": short_lived_token
        }
    )
    long_lived_data = long_lived_response.json()
    long_lived_token = long_lived_data["access_token"]
    expires_in = long_lived_data.get("expires_in", 5184000)  # ~60 days

    # Step 3: Verify token scopes
    debug_response = requests.get(
        "https://graph.facebook.com/v24.0/debug_token",
        params={"input_token": long_lived_token},
        headers={"Authorization": f"Bearer {os.getenv('META_APP_ACCESS_TOKEN')}"}
    )
    debug_data = debug_response.json()["data"]
    
    required_scopes = ["whatsapp_business_management", "whatsapp_business_messaging"]
    granted_scopes = debug_data.get("scopes", [])
    
    if not all(scope in granted_scopes for scope in required_scopes):
        return jsonify({"error": "Missing required scopes"}), 400

    # Step 4: Store tenant credentials
    tenant_id = get_current_tenant_id()  # Your SaaS tenant ID
    store_tenant_credentials(
        tenant_id=tenant_id,
        waba_id=waba_id,
        access_token=long_lived_token,
        token_expires_at=datetime.now() + timedelta(seconds=expires_in),
        scopes=granted_scopes
    )

    # Step 5: Fetch phone numbers for this WABA
    phone_numbers_response = requests.get(
        f"https://graph.facebook.com/v24.0/{waba_id}/phone_numbers",
        headers={"Authorization": f"Bearer {long_lived_token}"}
    )
    phone_numbers = phone_numbers_response.json().get("data", [])

    # Store phone numbers
    for phone in phone_numbers:
        store_phone_number(
            tenant_id=tenant_id,
            phone_number_id=phone["id"],
            display_phone_number=phone.get("display_phone_number"),
            verified_name=phone.get("verified_name")
        )

    return jsonify({
        "success": True,
        "waba_id": waba_id,
        "phone_numbers_count": len(phone_numbers)
    })
```

### Node.js/Express Example

```javascript
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/api/whatsapp/complete-onboarding", async (req, res) => {
  const { code, waba_id, version } = req.body;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.OAUTH_REDIRECT_URI,
        code: code
      }
    });

    const shortLivedToken = tokenRes.data.access_token;

    // Step 2: Exchange for long-lived token
    const longLivedRes = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });

    const { access_token: longLivedToken, expires_in } = longLivedRes.data;

    // Step 3: Verify scopes
    const debugRes = await axios.get("https://graph.facebook.com/v24.0/debug_token", {
      params: { input_token: longLivedToken },
      headers: { Authorization: `Bearer ${process.env.META_APP_ACCESS_TOKEN}` }
    });

    const { scopes, is_valid } = debugRes.data.data;
    const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging"];

    if (!is_valid || !requiredScopes.every(s => scopes.includes(s))) {
      return res.status(400).json({ error: "Invalid token or missing scopes" });
    }

    // Step 4: Store credentials (use your database)
    const tenantId = req.user.tenantId; // From your auth middleware
    await db.tenants.update(tenantId, {
      whatsapp_waba_id: waba_id,
      whatsapp_access_token: longLivedToken,
      whatsapp_token_expires_at: new Date(Date.now() + expires_in * 1000),
      whatsapp_scopes: scopes
    });

    // Step 5: Fetch phone numbers
    const phonesRes = await axios.get(
      `https://graph.facebook.com/v24.0/${waba_id}/phone_numbers`,
      { headers: { Authorization: `Bearer ${longLivedToken}` } }
    );

    const phoneNumbers = phonesRes.data.data || [];
    for (const phone of phoneNumbers) {
      await db.phoneNumbers.create({
        tenant_id: tenantId,
        phone_number_id: phone.id,
        display_phone_number: phone.display_phone_number,
        verified_name: phone.verified_name
      });
    }

    res.json({
      success: true,
      waba_id,
      phone_numbers_count: phoneNumbers.length
    });
  } catch (error) {
    console.error("Onboarding error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});
```

### Post-Onboarding Verification

After storing credentials, verify the phone number capabilities:

```bash
# Check if phone number supports Cloud API and WhatsApp Business App
curl "https://graph.facebook.com/v24.0/{BUSINESS_PHONE_NUMBER_ID}?fields=is_on_biz_app,platform_type,status" \
  -H "Authorization: Bearer {TENANT_TOKEN}"
```

**Response:**
```json
{
  "is_on_biz_app": true,
  "platform_type": "CLOUD_API",
  "status": "CONNECTED",
  "id": "106540352242922"
}
```

### Request Chat History Sync (Optional)

If the tenant opts in to share chat history, request synchronization:

```bash
curl -X POST "https://graph.facebook.com/v24.0/{BUSINESS_PHONE_NUMBER_ID}/smb_app_data" \
  -H "Authorization: Bearer {TENANT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "sync_type": "history"
  }'
```

**Response:**
```json
{
  "messaging_product": "whatsapp",
  "request_id": "<REQUEST_ID_FOR_SUPPORT>"
}
```

**Note:** This can only be performed once per customer. If history sharing is declined, you'll receive a webhook with error code `2593109` indicating "History sync is turned off by the business from the WhatsApp Business App."

### Chat History Webhook Handling

When history sharing is approved, you'll receive phased webhook payloads:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "history": [{
          "metadata": {
            "phase": 0,        // 0 = day 0-1, 1 = day 1-90, 2 = day 90-180
            "chunk_order": 1,  // Sequential chunk number
            "progress": 55     // Overall progress 0-100
          },
          "threads": [{
            "id": "16505551234",  // WhatsApp user phone number
            "messages": [{
              "from": "15550783881",
              "id": "wamid.HBgL...",
              "timestamp": "1739230955",
              "type": "text",
              "text": { "body": "Message content" },
              "history_context": { "status": "READ" }
            }]
          }]
        }]
      },
      "field": "history"
    }]
  }]
}
```

**Processing tips:**
- Track `progress` to show sync status to users
- `phase: 2` and `progress: 100` indicates completion
- Media messages appear as `type: "media_placeholder"` with separate webhooks for actual media
- Group chat messages are excluded from history sync

### Token Refresh Strategy

Long-lived tokens expire after ~60 days. Implement automatic refresh:

```python
# Python example: Token refresh job
def refresh_tenant_tokens():
    """Run daily to refresh tokens expiring within 7 days"""
    expiring_soon = get_tokens_expiring_in(days=7)
    
    for tenant in expiring_soon:
        try:
            # Exchange current token for new long-lived token
            response = requests.get(
                "https://graph.facebook.com/v24.0/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": os.getenv("META_APP_ID"),
                    "client_secret": os.getenv("META_APP_SECRET"),
                    "fb_exchange_token": tenant.whatsapp_access_token
                }
            )
            
            new_token_data = response.json()
            update_tenant_token(
                tenant_id=tenant.id,
                new_token=new_token_data["access_token"],
                expires_in=new_token_data.get("expires_in", 5184000)
            )
        except Exception as e:
            # Notify tenant to reconnect if refresh fails
            notify_token_refresh_failed(tenant.id, str(e))
```

### Error Handling

Common Embedded Signup errors:

| Error | Cause | Resolution |
|-------|-------|------------|
| `OAuthException` | Invalid `code` or expired | Re-initiate Embedded Signup flow |
| Missing scopes | User didn't grant permissions | Show permission request dialog again |
| `WABA not found` | WABA ID invalid | Verify `waba_id` from completion payload |
| Token exchange fails | App credentials invalid | Verify `META_APP_ID` and `META_APP_SECRET` |

---

## Phone Numbers & Business Management API

The Business Management API provides endpoints to manage WhatsApp Business Accounts (WABAs), phone numbers, system users, credit lines, and account settings.

### Phone Number Management

#### List All Phone Numbers

Retrieve all phone numbers associated with a WABA:

```bash
# Basic request
curl "https://graph.facebook.com/v24.0/{WABA_ID}/phone_numbers" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"

# With sorting (ascending by onboarding time)
curl "https://graph.facebook.com/v24.0/{WABA_ID}/phone_numbers?sort=['last_onboarded_time_ascending']" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"

# Filter by account mode (SANDBOX or LIVE) - Beta feature
curl "https://graph.facebook.com/v24.0/{WABA_ID}/phone_numbers?filtering=[{\"field\":\"account_mode\",\"operator\":\"EQUAL\",\"value\":\"SANDBOX\"}]" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

**Response:**
```json
{
  "data": [
    {
      "verified_name": "Jasper's Market",
      "display_phone_number": "+1 631-555-5555",
      "id": "1906385232743451",
      "quality_rating": "GREEN",
      "status": "CONNECTED",
      "account_mode": "LIVE"
    },
    {
      "verified_name": "Jasper's Ice Cream",
      "display_phone_number": "+1 631-555-5556",
      "id": "1913623884432103",
      "quality_rating": "NA",
      "status": "CONNECTED"
    }
  ],
  "paging": {
    "cursors": {
      "before": "...",
      "after": "..."
    }
  }
}
```

#### Get Phone Number Details

```bash
# Get status and capabilities
curl "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}?fields=status,is_on_biz_app,platform_type,whatsapp_business_manager_messaging_limit,throughput" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

**Response:**
```json
{
  "status": "CONNECTED",
  "is_on_biz_app": true,
  "platform_type": "CLOUD_API",
  "whatsapp_business_manager_messaging_limit": "TIER_250",
  "throughput": {
    "level": "tier_1",
    "current_message_credit": 50000,
    "total_message_credit": 100000
  },
  "id": "106540352242922"
}
```

#### Update Two-Step Verification PIN

```bash
curl -X POST "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "150954"
  }'
```

**Note:** Disabling two-step verification is not supported via API; use WhatsApp Manager UI.

#### Enable/Disable Identity Change Check

```bash
# Enable identity verification
curl -X POST "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/settings" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "user_identity_change": {
      "enable_identity_key_check": true
    }
  }'
```

When enabled, identity hashes are included in webhooks. Include the hash in send requests to verify recipient identity. Mismatches trigger error code `137000`.

#### Delete Phone Number

**Note:** Phone numbers cannot be deleted via API. Use WhatsApp Manager UI. Deletion is restricted if the number sent paid messages within the last 30 days.

### Phone Number Migration (Solution Partners)

For Solution Partners migrating phone numbers between WABAs:

#### Step 1: Request Verification Code

```bash
curl -X POST "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/request_code" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "code_method": "SMS",
    "language": "en_US"
  }'
```

**Response:**
```json
{
  "success": true
}
```

#### Step 2: Verify Code

```bash
curl -X POST "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/verify_code" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

#### Step 3: Initiate Migration

```bash
curl -X POST "https://graph.facebook.com/v24.0/{DESTINATION_WABA_ID}/phone_numbers" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -d "cc=1" \
  -d "phone_number=6315550000" \
  -d "migrate_phone_number=true"
```

**Response:**
```json
{
  "id": "<PHONE_NUMBER_ID>"
}
```

**Migration Notes:**
- Phone numbers must be migrated one at a time (no bulk migration)
- High-quality templates are duplicated and auto-approved in destination WABA
- Low-quality, rejected, or pending templates are not migrated
- Migrated templates have `UNKNOWN` quality rating for first 24 hours
- Messages sent before migration are charged to source business
- Rate limits apply to migration process

### WhatsApp Business Account (WABA) Management

#### Get WABA Details

```bash
curl "https://graph.facebook.com/v24.0/{WABA_ID}?fields=name,status,currency,country,business_verification_status,owner_business_info,primary_funding_id" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

**Response:**
```json
{
  "name": "Lucky Shrub",
  "status": "APPROVED",
  "currency": "USD",
  "country": "US",
  "business_verification_status": "verified",
  "owner_business_info": {
    "name": "Client Business Name",
    "id": "1972385232742147"
  },
  "primary_funding_id": "<PRIMARY_FUNDING_ID>",
  "id": "102290129340398"
}
```

### Credit Line Management

For SaaS platforms that subsidize customer messaging costs:

#### Step 1: Get Your Extended Credit Line ID

```bash
curl "https://graph.facebook.com/v24.0/{YOUR_BUSINESS_ID}/extendedcredits?fields=id,legal_entity_name" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "data": [
    {
      "id": "1972385232742146",
      "legal_entity_name": "Your Legal Entity"
    }
  ]
}
```

#### Step 2: Share Credit Line with Customer WABA

```bash
# Option A: Share and attach in one call
curl -X POST "https://graph.facebook.com/v24.0/{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_sharing_and_attach?waba_currency=USD&waba_id={CUSTOMER_WABA_ID}" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "allocation_config_id": "58501441721238",
  "waba_id": "102290129340398"
}
```

**Alternative: Two-step process**

```bash
# Step 2a: Get customer's business portfolio ID
curl "https://graph.facebook.com/v24.0/{CUSTOMER_WABA_ID}?fields=owner_business_info" \
  -H "Authorization: Bearer {CUSTOMER_BUSINESS_TOKEN}"

# Step 2b: Share credit line with business portfolio
curl -X POST "https://graph.facebook.com/v24.0/{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_sharing?receiving_business_id={CUSTOMER_BUSINESS_ID}" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"

# Step 2c: Attach credit line to WABA
curl -X POST "https://graph.facebook.com/v24.0/{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_attach?waba_currency=USD&waba_id={CUSTOMER_WABA_ID}" \
  -H "Authorization: Bearer {CUSTOMER_BUSINESS_TOKEN}"
```

#### Step 3: Verify Credit Sharing Status

```bash
# Get allocation config details
curl "https://graph.facebook.com/v24.0/{ALLOCATION_CONFIG_ID}?fields=receiving_business,request_status,receiving_credential" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "receiving_business": {
    "name": "Client Business Name",
    "id": "1972385232742147"
  },
  "request_status": "APPROVED",
  "receiving_credential": {
    "id": "<RECEIVING_CREDENTIAL_ID>"
  },
  "id": "58501441721238"
}
```

**Verify matching:**
- Compare `receiving_credential.id` with customer WABA's `primary_funding_id`
- They should match if credit sharing is properly configured

#### Step 4: Find Customer's Credit Sharing Record

```bash
curl "https://graph.facebook.com/v24.0/{EXTENDED_CREDIT_ID}/owning_credit_allocation_configs?receiving_business_id={CLIENT_BUSINESS_ID}&fields=id,receiving_business" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

#### Step 5: Revoke Credit Sharing

```bash
# Method 1: DELETE allocation config
curl -X DELETE "https://graph.facebook.com/v24.0/{ALLOCATION_CONFIG_ID}" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "success": true
}
```

**Verify revocation:**
```bash
# Check request_status changed to DELETED
curl "https://graph.facebook.com/v24.0/{ALLOCATION_CONFIG_ID}?fields=receiving_business,request_status" \
  -H "Authorization: Bearer {SYSTEM_USER_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "receiving_business": {
    "name": "Client Business Name",
    "id": "1972385232742147"
  },
  "request_status": "DELETED"
}
```

### System Users & Permissions

System users are Business Manager entities used for automated API access without user login.

#### Create System User (via Business Manager UI)

1. Go to Business Settings > Users > System Users
2. Click "Add" > "Create New System User"
3. Assign permissions: `whatsapp_business_management`, `whatsapp_business_messaging`
4. Generate access token (short-lived or long-lived)

#### Verify System User Token

```bash
curl "https://graph.facebook.com/v24.0/debug_token?input_token={SYSTEM_USER_TOKEN}" \
  -H "Authorization: Bearer {APP_ACCESS_TOKEN}"
```

**Response:**
```json
{
  "data": {
    "app_id": "634974688087057",
    "type": "SYSTEM_USER",
    "application": "Lucky Shrub",
    "data_access_expires_at": 0,
    "expires_at": 0,
    "is_valid": true,
    "issued_at": 1712099387,
    "scopes": [
      "whatsapp_business_management",
      "whatsapp_business_messaging"
    ],
    "granular_scopes": [
      { "scope": "whatsapp_business_management" },
      { "scope": "whatsapp_business_messaging" }
    ],
    "user_id": "104169029247128"
  }
}
```

### Account Update Webhooks

Subscribe to `account_update` webhooks to receive notifications about WABA changes:

#### Policy Violation

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "whatsapp-business-account-id",
    "time": 1604703058,
    "changes": [{
      "field": "account_update",
      "value": {
        "phone_number": "16505551111",
        "event": "ACCOUNT_VIOLATION",
        "violation_info": {
          "violation_type": "ALCOHOL"
        }
      }
    }]
  }]
}
```

#### Account Restriction

```json
{
  "field": "account_update",
  "value": {
    "phone_number": "16505551111",
    "event": "ACCOUNT_RESTRICTION",
    "restriction_info": [{
      "restriction_type": "RESTRICTION_ON_ADD_PHONE_NUMBER_ACTION",
      "expiration": 1604703058
    }]
  }
}
```

#### Partner Removed

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "time": 1739212624,
    "changes": [{
      "value": {
        "phone_number": "15550783881",
        "event": "PARTNER_REMOVED"
      },
      "field": "account_update"
    }]
  }]
}
```

### Phone Number Format Guidelines

**Supported formats:**
- `+16315551234` ✅ (Recommended)
- `+1 (631) 555-1234` ✅
- `(631) 555-1234` ⚠️ (May prepend business country code)
- `1 (631) 555-1234` ⚠️ (May prepend business country code)

**Best practice:** Always include `+` and country code to avoid misdelivery.

**Note:** For Brazil and Mexico, the Cloud API may modify phone number prefixes automatically. This is expected behavior.

---

## Messaging Fundamentals

### Sending messages

```bash
curl "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "+16505555555",
    "type": "text",
    "text": {
      "preview_url": true,
      "body": "Here is the info you requested!"
    }
  }'
```

Key fields:

- `messaging_product`: always `"whatsapp"`.
- `recipient_type`: `individual` (groups unsupported).
- `to`: WhatsApp ID or E.164.
- `type`: `text`, `template`, `interactive`, `image`, `document`, `audio`, `video`, `location`, `contacts`, `sticker`.
- `context`: reply references (previous `wamid`) when building conversational experiences.

Success responses include `contacts` and `messages` arrays with IDs – persist them to match webhook acknowledgements.

### Replying & read receipts

Set `context: { "message_id": "<wamid>" }` when replying to maintain threading. Mark messages as read by issuing `POST /{PHONE_NUMBER_ID}/messages` with `status: "read"` on a message ID.

---

## Message Types

| Type | Required payload subset | Notes |
| --- | --- | --- |
| **Text** | `{ "text": { "body": "..." , "preview_url": bool }}` | Markdown-like formatting supported. |
| **Template** | `type: "template"` + `template` object with `name`, `language`, optional components. |
| **Image/Document/Audio/Video** | `type` + `media` object with `id` (from upload) or `link`. Optional captions. |
| **Sticker** | `type: "sticker"` + `sticker` object referencing media ID. |
| **Location** | `type: "location"` + `location` with lat/long, address. |
| **Contacts** | `type: "contacts"` + contact array (vCards). |
| **Interactive Buttons** | `type: "interactive"`, `interactive.type: "button"` with up to 3 quick replies. |
| **Interactive Lists** | `interactive.type: "list"` with sections/rows. |
| **Product / Product List / Catalog** | `interactive.type: "product"` or `product_list` referencing catalog IDs. |
| **Catalog Message** | `interactive.type: "catalog_message"` with `thumbnail_product_retailer_id`. |
| **Checkout (beta)** | Template button `type: "order_details"` hooking into payments endpoints. |

### Sample: interactive quick replies

```json
{
  "messaging_product": "whatsapp",
  "to": "16315551234",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "Need help?" },
    "body": { "text": "Pick an option" },
    "footer": { "text": "Powered by Your SaaS" },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": { "id": "support_yes", "title": "Talk to support" }
        },
        {
          "type": "reply",
          "reply": { "id": "faq_link", "title": "FAQs" }
        }
      ]
    }
  }
}
```

Webhook payloads echo button clicks via `messages[].button` with the `payload`/`text` you defined.

---

## Media Management

1. **Upload** assets before referencing them in messages:

```bash
curl -X POST "https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/media" \
  -H "Authorization: Bearer {TOKEN}" \
  -F "file=@/path/to/asset.jpg" \
  -F "type=image/jpeg"
```

For server-side fetches, you can also provide a URL (Cloud API or On-Prem `/media` endpoint):

```json
{ "url": "https://example.com/path/to/image.jpg" }
```

On success you receive `{ "id": "gBEGkZdCkJYlAg..." }`.

2. **Reuse** media via `image: { "id": "<MEDIA_ID>" }`.

3. **Handle errors** such as `500 Media upload error (Connection closed)` by ensuring the source URL is reachable and supports HTTPS from Meta’s fetchers.

4. **Download** attachments by hitting `GET /{MEDIA_ID}` with the same tenant token.

---

## Template Lifecycle

### Creating templates

```bash
curl "https://graph.facebook.com/v24.0/{WABA_ID}/message_templates" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "item_back_in_stock_v1",
    "category": "marketing",
    "language": "en_US",
    "components": [
      { "type": "header", "format": "image", "example": { "header_handle": ["3:NDU..."] } },
      { "type": "body", "text": "Hi {{1}}! The {{2}} is back in stock!" },
      { "type": "footer", "text": "Tap Stop to unsubscribe." },
      {
        "type": "buttons",
        "buttons": [
          { "type": "order_details", "text": "Buy now" },
          { "type": "quick_reply", "text": "Stop" }
        ]
      }
    ]
  }'
```

Notes:

- Body max 1024 chars, footer 60 chars, button text 25 chars.
- Checkout buttons (`order_details`) require the Payments API (see below).
- Templates go through approval (status: `PENDING`, `APPROVED`, `REJECTED`). Poll via `GET /{WABA_ID}/message_templates`.

### Sending template messages

```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "template",
  "template": {
    "name": "item_back_in_stock_v2",
    "language": { "policy": "deterministic", "code": "en_US" },
    "components": [
      { "type": "body", "parameters": [ { "type": "text", "text": "Nidhi" }, { "type": "text", "text": "Blue Elf Aloe" } ] },
      {
        "type": "button",
        "sub_type": "order_details",
        "index": 0,
        "parameters": [
          {
            "type": "action",
            "action": {
              "order_details": {
                "reference_id": "abc.123_xyz-1",
                "currency": "INR",
                "payment_settings": [
                  {
                    "type": "payment_gateway",
                    "payment_gateway": {
                      "type": "razorpay",
                      "configuration_name": "prod-razor-pay-config-05"
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    ]
  }
}
```

---

## Interactive Flows & Extensions

Flows enable multi-screen experiences embedded inside WhatsApp.

| Action | Endpoint | Sample |
| --- | --- | --- |
| Create flow | `POST /{WABA_ID}/flows` | Provide `name`, `categories`, `flow_json`, `publish` flag. |
| Retrieve flow | `GET /{FLOW_ID}?fields=id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,whatsapp_business_account,application,health_status` | Returns metadata + preview info. |
| Update metadata | `POST /{FLOW_ID}` | e.g., rename or update endpoint URI. |
| List flows | `GET /{WABA_ID}/flows` | Supports paging cursors. |
| Download assets | `GET /{FLOW_ID}/assets` | Each asset includes `download_url`. |
| Deprecate flow | `POST /{FLOW_ID}/deprecate` | Blocks new sends while keeping history. |
| Migrate flows | `POST /{DEST_WABA_ID}/migrate_flows?source_waba_id=...&source_flow_names=...` | Copies flows between WABAs under same business. |
| Preview URL | `GET /{FLOW_ID}?fields=preview.invalidate(false)` | Returns shareable preview link + expiry. |

Flow JSON follows the Flow Builder schema (versions 5+). Validation errors indicate the line/column of invalid elements.

---

## Payments & Checkout Buttons

Checkout buttons inside templates call back into your commerce endpoints through encrypted requests. WhatsApp currently supports **India-only** payments flows (beta) with `order_details` buttons.

### Conversation template example

See the template example above: order details embed payment references (gateway config, shipping info, order totals).

### Checkout data exchange endpoints

| Sub-action | Purpose | Payload Highlights |
| --- | --- | --- |
| `/checkout/coupons` (`sub_action: "get_coupons"`) | Provide eligible coupons. | Include `order_details` and `user_id`. Return `coupons[]` with `code`, `description`. |
| `/checkout/apply_coupon` | Apply a coupon; adjust totals. | Accepts `coupon.code`, return updated `order_details`. |
| `/checkout/remove_coupon` | Remove coupon from order. | Example payload includes order summary and user ID. |
| `/checkout/apply_shipping` | Validate shipping address/costs. | Must include shipping addresses, totals, expiration, etc. |

Requests arrive encrypted (AES key + IV). Decrypt, process, respond with encrypted payload.

### Payments webhook sample

During templated checkout, button clicks produce `order_details` data in the template’s `button` component for you to reconcile.

---

## Webhooks & Event Handling

### Verification (GET)

WhatsApp calls your callback URL with `hub.mode=subscribe`, `hub.challenge`, and `hub.verify_token`. Compare tokens and echo `hub.challenge` to confirm.

### Delivery (POST)

- Content-Type: `application/json`
- Validate `X-Hub-Signature-256` with your app secret to ensure payload integrity.
- Return HTTP 200 with empty body upon success.

### Common payloads

1. **Inbound text message**

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "<BUSINESS_NUMBER>",
              "phone_number_id": "<PHONE_NUMBER_ID>"
            },
            "contacts": [
              {
                "profile": { "name": "NAME" },
                "wa_id": "16505551234"
              }
            ],
            "messages": [
              {
                "from": "16505551234",
                "id": "wamid.ID",
                "timestamp": "TIMESTAMP",
                "type": "text",
                "text": { "body": "Hello!" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

2. **Quick-reply button click** – same structure, but `messages[].type: "button"` with `button.text` and `button.payload`.

3. **Status updates**

```json
{
  "statuses": [
    {
      "id": "<wamid>",
      "status": "delivered",
      "timestamp": "1638420000",
      "recipient_id": "16315551234",
      "conversation": {
        "id": "<conversation_id>",
        "origin": { "type": "business_initiated" }
      },
      "pricing": {
        "billable": true,
        "pricing_model": "PMP",
        "category": "marketing"
      }
    }
  ]
}
```

4. **Failed statuses** – include `errors[]` (e.g., code `131050` when user opted out; `470` outside support window; `480` identity change).

5. **Click-to-WhatsApp ad referrals** – `messages[].referral` carries ad metadata (headline, body, media URLs).

6. **History sync** – `field: "history"`, includes `history[]` with progress and threads.

7. **Account updates** – `field: "account_update"` for messaging capability changes, pricing tier updates, or primary location.

### Operational webhook categories

- `business_capability_update` – new messaging limit values.
- `account_alerts` – e.g., “eligibility failed, send 2,000 delivered messages…”.
- `account_update` – pricing tier or location events.
- `messaging_operational_status` – general account health notifications.

---

## Pricing, Limits & Throughput

### Messaging limits

- Query via `GET /{PHONE_NUMBER_ID}?fields=whatsapp_business_manager_messaging_limit`.
- Webhook updates deliver `messaging_type: "business_capability_update"` with `max_daily_conversations_per_business`.
- Legacy fields (`max_daily_conversation_per_phone`) remain until Feb 2026.

### Pricing model

Per-message pricing (PMP) includes the following categories:

| Category | Notes |
| --- | --- |
| `marketing` | Outbound promotional templates. |
| `utility` | Transactional updates (order, alerts). |
| `authentication` / `authentication_international` | OTP flows; special rates for cross-border OTP. |
| `service` (`free_customer_service`) | Within open customer service window (non-billable). |
| `referral_conversion` | User reached you via CTWA ad; may be free depending on policy. |

Status webhooks carry the `pricing` object:

```json
"pricing": {
  "billable": false,
  "pricing_model": "PMP",
  "type": "free_customer_service",
  "category": "service"
}
```

### Volume tiers

`account_update` webhook event `VOLUME_BASED_PRICING_TIER_UPDATE` includes:

```json
{
  "volume_tier_info": {
    "tier_update_time": 1743451903,
    "pricing_category": "UTILITY",
    "tier": "25000001:50000000",
    "effective_month": "2025-11",
    "region": "INDIA"
  },
  "event": "VOLUME_BASED_PRICING_TIER_UPDATE"
}
```

### Throughput

- Retrieve via `GET /{PHONE_NUMBER_ID}?fields=throughput`.
- Use webhook alerts to detect throttling or capability downgrades.

---

## Operations, Reliability & HA

### Statistics & health endpoints (primarily for On-Prem/Hybrid enterprise deployments)

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/stats` | Aggregate Coreapp + DB metrics (queue sizes, pending messages). |
| `GET /v1/stats/app` | Coreapp-only stats (uptime, sessions). |
| `GET /v1/stats/db` | Database metrics (connections, QPS). |
| `GET /v1/support` | Detailed support bundle (socket connection status, role, shards). |

Although On-Prem was sunset Oct 23, 2025, these metrics are referenced for hybrid partners still migrating.

### Sharding / Multiconnect

- Check shards: `GET /v1/account/shards`.
- Update shards: `PATCH /v1/account/shards` with `{ "cc": "1", "phone_number": "6315550000", "shards": 8, "pin": "...", "cert": "Base64..." }`.
- Enable multiconnect (scales Coreapp containers) via `POST /v1/account/shards`.

### Support & certificates

- Upload webhook CA via `/certificates/webhooks/ca`.
- Use `/v1/support` health data to confirm container roles (primary/secondary/coreapp) when debugging.

### Identity change handling

System messages with `type: "user_identity_changed"` or `user_changed_number` indicate recipients reinstalled or changed numbers. Pause sending until resolved; webhook includes `system.identity` or `system.new_wa_id`.

---

## Error Handling & Troubleshooting

| Error Scenario | Payload / Code | Resolution |
| --- | --- | --- |
| **Unsupported message type** | Webhook `errors[0].code = 131051`, `details: "Message type is not currently supported"` | Ensure you send supported `type` field; degrade gracefully. |
| **User opted out of marketing** | Status errors `code: 131050`, “recipient has chosen to stop receiving marketing messages” | Stop marketing templates for that WA ID; offer re-opt-in off-platform. |
| **Outside support window** | Error `470` | Send template first (business-initiated) to reopen conversation. |
| **Identity change detected** | Error `480` | Trigger identity verification flow or request user to message again. |
| **Media upload failure** | `statuses[].errors[].title = "Media upload error (Connection closed)"` | Validate source URL, MIME, size, TLS compatibility. |
| **Payments API error** | `errors: [{ "code": "...", "title": "...", "details": "..." }]` | Inspect code for invalid coupon/shipping data. |
| **History sync declined** | `history[].errors[0].code = 2593109` with message “History sync is turned off by the business” | Surface to tenant; allow re-enable from Business App. |

### Webhook failure handling

WhatsApp retries failed webhook deliveries with exponential backoff up to 36 hours. Implement idempotent processing keyed by `wamid` + change `field`.

### Logging tips

- Persist request/response IDs (`wamid`, `conversation.id`, `entry.id`) for cross-referencing with Meta Support.
- Mirror the `X-Hub-Signature-256` validation result for audit.
- Track template send failures vs approvals to catch policy regressions early.

---

## Reference Appendix

### Core endpoints

#### Messaging Endpoints

| Area | Method & Path | Description |
| --- | --- | --- |
| Send messages | `POST /{PHONE_NUMBER_ID}/messages` | Send text, media, template, or interactive messages. |
| Media upload | `POST /{PHONE_NUMBER_ID}/media` | Upload an asset (or `/media` On-Prem). |
| Media download | `GET /{MEDIA_ID}` | Download previously uploaded media. |
| Templates | `POST /{WABA_ID}/message_templates` | Create; `GET` to list/filter; `DELETE /{TEMPLATE_ID}` to remove. |

#### Webhooks

| Area | Method & Path | Description |
| --- | --- | --- |
| Webhook verify | `GET {CALLBACK_URL}?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...` | Echo `hub.challenge` for verification. |
| Webhook delivery | `POST {CALLBACK_URL}` | Receive inbound messages, statuses, pricing, history, account updates. |
| Configure webhooks | App Dashboard or `POST /{APP_ID}/subscriptions` | Register callback URL + verify token. |

#### Embedded Signup & OAuth

| Area | Method & Path | Description |
| --- | --- | --- |
| OAuth token exchange | `GET /oauth/access_token?client_id=...&client_secret=...&code=...` | Exchange Embedded Signup code for short-lived token. |
| Long-lived token | `GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=...` | Exchange short-lived for long-lived token (~60 days). |
| Token refresh | `GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=...` | Refresh long-lived token before expiry. |
| Token debug | `GET /debug_token?input_token=...` | Validate tenant token scopes / expiry / validity. |

#### Phone Number Management

| Area | Method & Path | Description |
| --- | --- | --- |
| List phone numbers | `GET /{WABA_ID}/phone_numbers` | Get all phone numbers; supports `sort` and `filtering` params. |
| Phone number details | `GET /{PHONE_NUMBER_ID}?fields=status,is_on_biz_app,platform_type,whatsapp_business_manager_messaging_limit,throughput` | Onboarding health + limits + capabilities. |
| Update PIN | `POST /{PHONE_NUMBER_ID}` | Set/change two-step verification PIN (`{ "pin": "150954" }`). |
| Identity check | `POST /{PHONE_NUMBER_ID}/settings` | Enable/disable identity change verification. |
| Request verification code | `POST /{PHONE_NUMBER_ID}/request_code` | Request SMS/VOICE code for phone migration (`code_method`, `language`). |
| Verify code | `POST /{PHONE_NUMBER_ID}/verify_code` | Verify 6-digit code for phone ownership. |
| Phone migration | `POST /{DEST_WABA_ID}/phone_numbers?cc=...&phone_number=...&migrate_phone_number=true` | Migrate phone number between WABAs (Solution Partners). |
| SMB history sync | `POST /{PHONE_NUMBER_ID}/smb_app_data` | Request chat history sync (`sync_type: "history"`). |

#### WhatsApp Business Account (WABA) Management

| Area | Method & Path | Description |
| --- | --- | --- |
| Get WABA details | `GET /{WABA_ID}?fields=name,status,currency,country,business_verification_status,owner_business_info,primary_funding_id` | Retrieve WABA metadata and business info. |
| List WABA phone numbers | `GET /{WABA_ID}/phone_numbers` | All phone numbers associated with WABA. |

#### Credit Line Management

| Area | Method & Path | Description |
| --- | --- | --- |
| Get credit lines | `GET /{BUSINESS_ID}/extendedcredits?fields=id,legal_entity_name` | List your extended credit lines. |
| Share & attach credit | `POST /{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_sharing_and_attach?waba_currency=...&waba_id=...` | Share credit line with customer WABA (one-step). |
| Share credit (two-step) | `POST /{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_sharing?receiving_business_id=...` | Share credit with business portfolio. |
| Attach credit | `POST /{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_attach?waba_currency=...&waba_id=...` | Attach credit line to WABA. |
| Get allocation config | `GET /{ALLOCATION_CONFIG_ID}?fields=receiving_business,request_status,receiving_credential` | Verify credit sharing status. |
| Find allocation | `GET /{EXTENDED_CREDIT_ID}/owning_credit_allocation_configs?receiving_business_id=...&fields=id,receiving_business` | Find customer's credit sharing record. |
| Revoke credit | `DELETE /{ALLOCATION_CONFIG_ID}` | Revoke credit sharing. |

#### Flows & Extensions

| Area | Method & Path | Description |
| --- | --- | --- |
| Create flow | `POST /{WABA_ID}/flows` | Create new WhatsApp Flow (`name`, `categories`, `flow_json`, `publish`). |
| Get flow | `GET /{FLOW_ID}?fields=id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,whatsapp_business_account,application,health_status` | Retrieve flow details. |
| List flows | `GET /{WABA_ID}/flows` | List all flows for WABA (supports paging). |
| Update flow | `POST /{FLOW_ID}` | Update flow metadata (name, categories, endpoint URI). |
| Deprecate flow | `POST /{FLOW_ID}/deprecate` | Mark published flow as deprecated. |
| Migrate flows | `POST /{DEST_WABA_ID}/migrate_flows?source_waba_id=...&source_flow_names=...` | Copy flows between WABAs. |
| Flow assets | `GET /{FLOW_ID}/assets` | Download flow assets (JSON, images, etc.). |
| Flow preview | `GET /{FLOW_ID}?fields=preview.invalidate(false)` | Generate shareable preview URL. |

#### Payments & Checkout (India Beta)

| Area | Method & Path | Description |
| --- | --- | --- |
| Get coupons | `POST /checkout/coupons` | Return eligible coupons for order (`sub_action: "get_coupons"`). |
| Apply coupon | `POST /checkout/apply_coupon` | Apply coupon code to order (`sub_action: "apply_coupon"`). |
| Remove coupon | `POST /checkout/remove_coupon` | Remove applied coupon (`sub_action: "remove_coupon"`). |
| Apply shipping | `POST /checkout/apply_shipping` | Validate shipping address/costs (`sub_action: "apply_shipping"`). |

#### Operations & Monitoring

| Area | Method & Path | Description |
| --- | --- | --- |
| Stats (aggregate) | `GET /v1/stats` | Coreapp + DB metrics (queue sizes, pending messages). |
| Stats (Coreapp) | `GET /v1/stats/app` | Coreapp-only stats (uptime, sessions). |
| Stats (DB) | `GET /v1/stats/db` | Database metrics (connections, QPS). |
| Support info | `GET /v1/support` | Detailed support bundle (socket status, role, shards). |
| Get shards | `GET /v1/account/shards` | Current shard configuration. |
| Update shards | `PATCH /v1/account/shards` | Change shard count (`cc`, `phone_number`, `shards`, `pin`, `cert`). |
| Enable multiconnect | `POST /v1/account/shards` | Enable multiconnect scaling. |
| Upload CA cert | `POST /certificates/webhooks/ca` | Upload PEM-encoded CA certificate for webhook SSL. |

### Useful meta links

- Overview & Quickstart – https://developers.facebook.com/docs/whatsapp/overview
- Webhooks – https://developers.facebook.com/docs/whatsapp/webhooks
- Messaging limits – https://developers.facebook.com/docs/whatsapp/messaging-limits
- Pricing – https://developers.facebook.com/docs/whatsapp/pricing
- Templates – https://developers.facebook.com/docs/whatsapp/message-templates
- Flows & Extensions – https://developers.facebook.com/docs/whatsapp/extensions
- Payments (IN beta) – https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api
- Embedded Signup – https://developers.facebook.com/docs/whatsapp/embedded-signup
- Business Management API – https://developers.facebook.com/docs/whatsapp/business-management-api
- Phone Numbers – https://developers.facebook.com/docs/whatsapp/phone-numbers
- Credit Line Management – https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/share-and-revoke-credit-lines
- Phone Number Migration – https://developers.facebook.com/docs/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-programmatically

---

**Next steps for integrators**

1. Automate Embedded Signup in your onboarding UI and store per-tenant tokens securely.
2. Stand up webhook infrastructure with signature validation + idempotency.
3. Build shared services for template management, media upload caching, and checkout encryption helpers.
4. Monitor messaging limits/pricing webhooks to warn tenants when nearing caps.
5. Leverage Composio or in-house orchestration to wrap Graph calls with observability, retries, and tenant isolation.

