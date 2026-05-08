import crypto from "crypto"

const url = process.env.WEBHOOK_URL || "http://127.0.0.1:4001/webhooks/whatsapp"
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || ""
const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || ""
if (!secret) {
  console.error("missing_app_secret")
  process.exit(1)
}

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "<WABA_ID>",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550783881", phone_number_id: "106540352242922" },
            contacts: [{ wa_id: "16505551234", profile: { name: "Test" } }],
            messages: [{ from: "16505551234", id: "wamid.test", timestamp: Date.now().toString(), type: "text", text: { body: "Hello" } }]
          }
        }
      ]
    }
  ]
}

const raw = JSON.stringify(payload)
const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex")

async function main() {
  if (verifyToken) {
    const vurl = `${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=test123`
    const vr = await fetch(vurl, { method: "GET" })
    const vtext = await vr.text()
    console.log(JSON.stringify({ verify_status: vr.status, verify_body: vtext }))
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: raw })
  const text = await r.text()
  console.log(JSON.stringify({ status: r.status, ok: r.ok, body: text }))
}

main().catch(e => { console.error("request_failed", e); process.exit(1) })
