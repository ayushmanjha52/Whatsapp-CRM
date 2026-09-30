import type { FastifyInstance } from "fastify"
import { env, Queues } from "../common/config"
import { queue } from "../common/queue"
import { isValidSignature } from "./signature"

/**
 * Meta webhook endpoints. Register in its own encapsulated plugin: it swaps the JSON
 * parser for one that keeps the raw bytes Meta signed.
 */
export default async function whatsappWebhookRoutes(app: FastifyInstance) {
  app.removeContentTypeParser("application/json")
  app.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: 5 * 1024 * 1024 }, (req: any, body: Buffer, done) => {
    req.rawBody = body
    try { done(null, JSON.parse(body.toString("utf8"))) } catch { done(new Error("invalid_json"), undefined) }
  })

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
      req.log.warn({ has_header: !!header }, "webhook_signature_invalid")
      return res.status(401).send()
    }
    const body = req.body || {}
    await queue(Queues.InboundEvents).add("webhook", body)
    req.log.info({ object: body.object, entries: Array.isArray(body.entry) ? body.entry.length : 0 }, "webhook_enqueued")
    // Acknowledge fast: Meta retries if we take too long.
    return res.status(200).send()
  })
}
