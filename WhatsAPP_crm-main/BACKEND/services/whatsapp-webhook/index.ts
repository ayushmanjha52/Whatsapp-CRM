import Fastify from "fastify"
import { env } from "../../src/common/config"
import { redis } from "../../src/common/queue"
import whatsappWebhookRoutes from "../../src/whatsapp/webhookRoutes"

// Standalone receiver, for deployments that scale webhooks separately from the API.
// The gateway serves the same routes, so single-service deployments don't need this.
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" } })

if (!env.WHATSAPP_APP_SECRET || !env.WHATSAPP_VERIFY_TOKEN) {
  app.log.warn({ app_secret: !!env.WHATSAPP_APP_SECRET, verify_token: !!env.WHATSAPP_VERIFY_TOKEN }, "webhook_env_missing")
}

app.get("/healthz", async () => ({ ok: true }))
await app.register(whatsappWebhookRoutes)

if (import.meta.main) {
  await redis().ping().catch(e => app.log.error({ err: e?.message }, "redis_unreachable"))
  await app.listen({ port: env.WEBHOOK_PORT, host: "0.0.0.0" })
}
