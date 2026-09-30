import Fastify, { type FastifyInstance } from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import multipart from "@fastify/multipart"
import fastifySocketIO from "fastify-socket.io"
import { FastifyAdapter } from "@bull-board/fastify"
import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { assertEnv, env, Queues } from "../../src/common/config"
import { createRedisConnection, queue, redis } from "../../src/common/queue"
import { TENANT_CHANNEL_PATTERN, tenantRoom } from "../../src/common/realtime"
import { sha256Hex } from "../../src/auth/token"
import { authenticate, csrfGuard, resolveAuth, tokenFromCookieHeader, tokenFromRequest } from "../../src/http/auth"
import { forbidden, toErrorResponse } from "../../src/http/errors"
import authRoutes from "./routes/auth"
import conversationRoutes from "./routes/conversations"
import contactRoutes from "./routes/contacts"
import pipelineRoutes from "./routes/pipeline"
import campaignRoutes from "./routes/campaigns"
import templateRoutes from "./routes/templates"
import taskRoutes from "./routes/tasks"
import dashboardRoutes from "./routes/dashboard"
import teamRoutes from "./routes/team"
import mediaRoutes, { MAX_UPLOAD_BYTES } from "./routes/media"
import billingRoutes, { stripeWebhookRoutes } from "./routes/billing"
import aiRoutes from "./routes/ai"
import whatsappWebhookRoutes from "../../src/whatsapp/webhookRoutes"
import fastifyStatic from "@fastify/static"
import { existsSync, readFileSync } from "fs"
import { join, sep } from "path"
import whatsappApi from "../whatsapp-api/index"

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024
  })

  await app.register(cookie)
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "csrf-token", "ngrok-skip-browser-warning"]
  })
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } })
  await app.register(rateLimit, {
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 600),
    timeWindow: "1 minute",
    keyGenerator: req => {
      const token = tokenFromRequest(req)
      return token ? `u:${sha256Hex(token).slice(0, 16)}` : req.ip
    }
  })
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })

  app.setErrorHandler((err, req, reply) => {
    const { status, body } = toErrorResponse(err)
    if (status >= 500) req.log.error({ err }, "unhandled_error")
    reply.status(status).send(body)
  })

  app.get("/healthz", async (_req, res) => {
    try {
      await redis().ping()
      return { ok: true }
    } catch {
      return res.status(503).send({ ok: false, redis: "unreachable" })
    }
  })

  await app.register(authRoutes, { prefix: "/api/auth" })

  await app.register(async api => {
    api.addHook("preHandler", authenticate)
    api.addHook("preHandler", csrfGuard)
    await api.register(conversationRoutes)
    await api.register(contactRoutes)
    await api.register(pipelineRoutes)
    await api.register(campaignRoutes)
    await api.register(templateRoutes)
    await api.register(taskRoutes)
    await api.register(dashboardRoutes)
    await api.register(teamRoutes)
    await api.register(mediaRoutes)
    await api.register(billingRoutes)
    await api.register(aiRoutes)
    await api.register(whatsappApi, { prefix: "/whatsapp" })
  }, { prefix: "/api" })

  await app.register(stripeWebhookRoutes)
  // The gateway also receives Meta webhooks, so a single public service is enough.
  await app.register(whatsappWebhookRoutes)

  // Serve the built SPA from the same origin when STATIC_DIR points at frontend/dist.
  const staticDir = process.env.STATIC_DIR
  if (staticDir && existsSync(join(staticDir, "index.html"))) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
      index: false,
      cacheControl: false,
      setHeaders: (res, path) => {
        res.setHeader("Cache-Control", path.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache")
      }
    })
    const indexHtml = readFileSync(join(staticDir, "index.html"), "utf8")
    app.setNotFoundHandler((req, res) => {
      const apiLike = /^\/(api|socket\.io|webhooks|admin)(\/|$)/.test(req.url)
      if (req.method !== "GET" || apiLike) return res.status(404).send({ error: "not_found", message: "Not found" })
      // Client-side routes (/inbox/…, /settings…) all load the app shell.
      return res
        .header("Cache-Control", "no-cache")
        .header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' wss: ws:; frame-ancestors 'none'")
        .type("text/html")
        .send(indexHtml)
    })
  }

  // Meta redirects here after OAuth; the frontend finishes onboarding with the code.
  app.get("/auth/whatsapp/callback", async (req, res) => {
    const q = req.query as Record<string, string>
    const target = new URL("/settings", env.FRONTEND_BASE_URL)
    target.searchParams.set("tab", "whatsapp")
    for (const k of ["code", "state", "error", "error_description"]) if (q[k]) target.searchParams.set(k, q[k])
    return res.redirect(target.toString())
  })

  // Queue dashboard: shows every tenant's jobs, so only platform operators may open it.
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  if (adminEmails.length > 0) {
    const serverAdapter = new FastifyAdapter()
    serverAdapter.setBasePath("/admin/queues")
    createBullBoard({
      queues: Object.values(Queues).map(name => new BullMQAdapter(queue(name))),
      serverAdapter
    })
    await app.register(async board => {
      board.addHook("onRequest", async req => {
        const ctx = await resolveAuth(tokenFromRequest(req))
        if (!adminEmails.includes(ctx.email)) throw forbidden("platform_admin_only")
      })
      await board.register(serverAdapter.registerPlugin(), { prefix: "/admin/queues" })
    })
  }

  await app.register(fastifySocketIO as any, {
    path: "/socket.io/",
    cors: { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true, credentials: true },
    transports: ["websocket", "polling"]
  })

  return app
}

/** Relays tenant events from Redis to the sockets connected to this process. */
function startRealtime(app: FastifyInstance) {
  const io = (app as any).io
  io.use(async (socket: any, next: any) => {
    try {
      const h = socket.handshake || {}
      const token = tokenFromCookieHeader(h.headers?.cookie, h.headers?.authorization)
      socket.data = { auth: await resolveAuth(token) }
      next()
    } catch {
      next(new Error("unauthorized"))
    }
  })
  io.on("connection", (socket: any) => {
    const auth = socket.data?.auth
    if (!auth?.tenantId) return socket.disconnect(true)
    socket.join(tenantRoom(auth.tenantId))
  })

  const sub = createRedisConnection()
  sub.psubscribe(TENANT_CHANNEL_PATTERN)
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const tenantId = channel.split(":")[1]
    if (!tenantId) return
    try {
      // Every gateway replica subscribes, so each only emits to its own sockets.
      io.local.to(tenantRoom(tenantId)).emit("event", JSON.parse(message))
    } catch (err: any) {
      app.log.error({ err: err?.message, channel }, "realtime_forward_failed")
    }
  })
  return sub
}

if (import.meta.main) {
  assertEnv("api-gateway", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "SUPABASE_ANON_KEY", "DATA_ENCRYPTION_KEY"])
  const app = await buildApp()
  await app.ready()
  const sub = startRealtime(app)
  await app.listen({ port: env.GATEWAY_PORT, host: "0.0.0.0" })
  const shutdown = async () => {
    await sub.quit().catch(() => {})
    await app.close()
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}
