/**
 * Sends a correctly signed WhatsApp webhook to the local webhook service, so the whole
 * inbound pipeline (webhook → queue → inbox-service → DB → realtime → UI) can be exercised
 * without Meta.
 *
 *   bun run tools/simulate-webhook.ts --phone-number-id 1234 --from 15551234567 --name "Jane" --text "Hi!"
 *   bun run tools/simulate-webhook.ts --phone-number-id 1234 --status delivered --wamid wamid.XYZ --from 15551234567
 *
 * The phone number id must belong to a connected workspace (Settings → WhatsApp).
 */
import crypto from "crypto"

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

const url = arg("url", process.env.WEBHOOK_URL || "http://127.0.0.1:4001/webhooks/whatsapp")
const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || ""
const phoneNumberId = arg("phone-number-id", process.env.WHATSAPP_PHONE_NUMBER_ID || "")
const from = arg("from", "15551234567")
const status = arg("status")

if (!secret) throw new Error("Set WHATSAPP_APP_SECRET (or META_APP_SECRET) to sign the payload")
if (!phoneNumberId) throw new Error("Pass --phone-number-id (a number connected to your workspace)")

const ts = Math.floor(Date.now() / 1000).toString()
const value: Record<string, unknown> = {
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "15550000000", phone_number_id: phoneNumberId }
}
if (status) {
  value.statuses = [{ id: arg("wamid"), status, timestamp: ts, recipient_id: from }]
} else {
  value.contacts = [{ wa_id: from, profile: { name: arg("name", "Test Customer") } }]
  value.messages = [{ from, id: `wamid.SIM${crypto.randomUUID().replace(/-/g, "")}`, timestamp: ts, type: "text", text: { body: arg("text", "Hello from the simulator") } }]
}
const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "SIMULATED_WABA", changes: [{ field: "messages", value }] }] })
const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")

const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body })
console.log(res.status === 200 ? "✓ webhook accepted" : `✗ webhook rejected: HTTP ${res.status}`)
