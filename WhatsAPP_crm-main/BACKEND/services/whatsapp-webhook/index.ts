import Fastify from "fastify"
import { env, Queues } from "../../src/common/config"
import { queue, redis } from "../../src/common/queue"
import { isValidSignature } from "../../src/whatsapp/signature"

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, bodyLimit: 5 * 1024 * 1024 })

// Keep the exact bytes Meta signed; re-serialized JSON would not match the signature.
app.removeContentTypeParser("application/json")
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req: any, body: Buffer, done) => {
  req.rawBody = body
  try { done(null, JSON.parse(body.toString("utf8"))) } catch { done(new Error("invalid_json"), undefined) }
})

if (!env.WHATSAPP_APP_SECRET || !env.WHATSAPP_VERIFY_TOKEN) {
  app.log.warn({ app_secret: !!env.WHATSAPP_APP_SECRET, verify_token: !!env.WHATSAPP_VERIFY_TOKEN }, "webhook_env_missing")
}

app.get("/healthz", async () => ({ ok: true }))

// Meta's subscription handshake.
app.get("/webhooks/whatsapp", async (req, res) => {
  const q = req.query as Record<string, string>
  if (q["hub.mode"] === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && q["hub.verify_token"] === env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).type("text/plain").send(q["hub.challenge"])
  }
  return res.status(403).send()
})

app.post("/webhooks/whatsapp", async (req: any, res) => {
  const header = req.headers["x-hub-signature-256"] as string | undefined
  const devBypass = process.env.ALLOW_DEV_NO_SIGNATURE === "1" && !header
  if (!devBypass && !isValidSignature(req.rawBody, header, env.WHATSAPP_APP_SECRET)) {
    app.log.warn({ has_header: !!header }, "webhook_signature_invalid")
    return res.status(401).send()
  }
  const body = req.body || {}
  await queue(Queues.InboundEvents).add("webhook", body)
  app.log.info({ object: body.object, entries: Array.isArray(body.entry) ? body.entry.length : 0 }, "webhook_enqueued")
  // Acknowledge fast: Meta retries if we take too long.
  return res.status(200).send()
})

if (import.meta.main) {
  await redis().ping().catch(e => app.log.error({ err: e?.message }, "redis_unreachable"))
  await app.listen({ port: env.WEBHOOK_PORT, host: "0.0.0.0" })
}
