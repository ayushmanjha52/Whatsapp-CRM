import Fastify from "fastify"
import rawBody from "fastify-raw-body"
import crypto from "crypto"
import { getEnv, Queues } from "../../src/common/config"
import { queue } from "../../src/common/queue"

const env = getEnv()
const app = Fastify({ logger: true })
app.removeContentTypeParser("application/json")
app.addContentTypeParser("application/json", { parseAs: "string" }, (req: any, body: string, done: any) => {
  ;(req as any).rawBody = body
  try { done(null, JSON.parse(body)) } catch { done(new Error("invalid_json")) }
})
const missingEnv: string[] = []
if (!env.WHATSAPP_APP_SECRET) missingEnv.push("WHATSAPP_APP_SECRET")
if (!env.WHATSAPP_VERIFY_TOKEN) missingEnv.push("WHATSAPP_VERIFY_TOKEN")
if (missingEnv.length > 0) app.log.warn({ missing: missingEnv }, "env_missing")

app.get("/webhooks/whatsapp", async (req, res) => {
  const q: any = (req.query || {})
  const mode = q["hub.mode"]
  const token = q["hub.verify_token"]
  const challenge = q["hub.challenge"]
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }
  return res.status(403).send()
})

function validateSignature(req: any): boolean {
  const secret = env.WHATSAPP_APP_SECRET || ""
  const receivedHeader = (req.headers["x-hub-signature-256"] || "") as string
  const received = receivedHeader.toString().trim().toLowerCase()
  const body = req.rawBody
  const devBypass = process.env.ALLOW_DEV_NO_SIGNATURE === "1"
  if (devBypass && !received) return true
  if (!secret || !received || !body) {
    if (process.env.DEBUG_WEBHOOK_SIGNATURE === "1") {
      app.log.info({ sig_header_present: !!received, secret_present: !!secret, raw_present: !!body }, "sig_prereq_missing")
    }
    return false
  }
  const expectedHex = crypto.createHmac("sha256", secret).update(body).digest("hex")
  const receivedHex = received.replace(/^sha256=/, "")
  const a = Buffer.from(expectedHex, "hex")
  const b = Buffer.from(receivedHex, "hex")
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (process.env.DEBUG_WEBHOOK_SIGNATURE === "1") {
    app.log.info({ match: ok, len_expected: a.length, len_received: b.length }, "sig_check_result")
  }
  return ok
}

app.post("/webhooks/whatsapp", async (req, res) => {
  if (!validateSignature(req)) {
    if (process.env.DEBUG_WEBHOOK_SIGNATURE === "1") app.log.info({ path: "/webhooks/whatsapp" }, "sig_invalid")
    return res.status(401).send()
  }
  const body: any = req.body || {}
  const q = queue(Queues.InboundEvents)
  try {
    const meta = { object: body?.object, entries: Array.isArray(body?.entry) ? body.entry.length : 0 }
    app.log.info(meta, "webhook_enqueued")
  } catch {}
  await q.add("webhook", body)
  return res.status(200).send()
})

app.listen({ port: Number(process.env.PORT || 4001), host: "0.0.0.0" })
