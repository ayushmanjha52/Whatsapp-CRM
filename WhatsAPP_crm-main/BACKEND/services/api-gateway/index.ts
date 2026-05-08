import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import { z } from "zod"
import fastifySocketIO from "fastify-socket.io"
import { createAdapter as createRedisAdapter } from "@socket.io/redis-adapter"
import { queue, redis } from "../../src/common/queue"
import { Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import { supabaseAuth } from "../../src/common/supabaseAuth"
import { generateCsrfToken, verifyCsrfToken } from "../../src/auth/csrf"
import { logAuth } from "../../src/auth/log"
import { hashPassword } from "../../src/auth/password"
import { sha256Hex } from "../../src/auth/token"
import { verifyAccessToken, signAccessToken } from "../../src/auth/jwt"
import sensible from "@fastify/sensible"
import whatsappApi from "../whatsapp-api/index.ts"

const app = Fastify({ logger: true })

app.register(sensible)

app.register(cookie)
app.register(cors, { origin: true, credentials: true, methods: ["GET","POST","PUT","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","x-csrf-token","csrf-token","ngrok-skip-browser-warning"] })
app.register(helmet, { contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'none'"],
    connectSrc: ["'self'"],
    imgSrc: ["'self'"],
    styleSrc: ["'self'"],
    scriptSrc: ["'self'"]
  }
}})
app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
  hook: "onRequest",
  ban: 0,
  keyGenerator: (req: any) => {
    const token = req.cookies?.sb_access_token
    if (token) return `u:${sha256Hex(token).slice(0,16)}`
    return req.ip
  }
})
app.register(whatsappApi, { prefix: "/api/whatsapp" })
app.register(fastifySocketIO, {
  path: "/socket.io/",
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"]
})

// Redis subscriber is set up in app.ready() after Socket.IO is initialized

app.get("/inbox/threads", async (req, res) => {
  const user = await requireAuth(req)
  const r = redis()
  const key = `inbox:threads:${user.id}`
  const waIds = await r.zrevrange(key, 0, 49)
  const s = supabaseAdmin()

  if (waIds && waIds.length > 0) {
    const { data } = await s.from("contacts").select("wa_id,display_name,profile_image_url,phone_e164").eq("tenant_id", user.id).in("wa_id", waIds)
    const byWa: Record<string, any> = {}
    for (const c of data || []) byWa[(c as any).wa_id] = c

    // Fetch last message for each thread from Redis
    const threadPromises = waIds.map(async (waId) => {
      const msgKey = `inbox:messages:${user.id}:${waId}`
      const lastMsgRaw = await r.lindex(msgKey, 0)
      let lastMessage = ''
      let lastMessageTime = new Date().toISOString()

      if (lastMsgRaw) {
        try {
          const lastMsg = JSON.parse(lastMsgRaw)
          lastMessageTime = new Date(lastMsg.timestamp).toISOString()
          const payload = lastMsg.payload || {}
          const msgType = lastMsg.type

          // Format last message preview based on type
          if (msgType === 'text') {
            lastMessage = payload.text?.body || ''
          } else if (msgType === 'image') {
            lastMessage = '[Image]'
          } else if (msgType === 'video') {
            lastMessage = '[Video]'
          } else if (msgType === 'audio') {
            lastMessage = '[Audio]'
          } else if (msgType === 'document') {
            lastMessage = '[Document]'
          } else if (msgType === 'sticker') {
            lastMessage = '[Sticker]'
          } else {
            lastMessage = '[Message]'
          }
        } catch {
          lastMessage = '[Message]'
        }
      }

      // Only return thread if contact exists in database (not deleted)
      const contactInfo = byWa[waId]
      if (!contactInfo) {
        return null // Skip deleted contacts
      }

      return {
        wa_id: waId,
        display_name: contactInfo.display_name,
        profile_image_url: contactInfo.profile_image_url,
        phone_e164: contactInfo.phone_e164,
        last_message: lastMessage,
        last_message_time: lastMessageTime
      }
    })

    const threads = (await Promise.all(threadPromises)).filter(t => t !== null)
    if (threads.length < waIds.length) {
      console.log(`[getThreads] Filtered out ${waIds.length - threads.length} deleted contacts`)
    }
    return res.send({ threads })
  }

  // Fallback: fetch from database if Redis is empty
  const { data: recentMessages } = await s
    .from("messages")
    .select("thread_id,created_at,direction,type,payload_json")
    .eq("tenant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)

  const seen = new Set<string>()
  const threadsMap: Map<string, any> = new Map()

  for (const m of recentMessages || []) {
    const waId = (m as any).thread_id
    if (!waId || seen.has(waId)) continue
    seen.add(waId)

    let lastMessage = ''
    const payload = m.payload_json || {}

    if (m.type === 'text') {
      lastMessage = payload.text?.body || ''
    } else if (m.type === 'image') {
      lastMessage = '[Image]'
    } else if (m.type === 'video') {
      lastMessage = '[Video]'
    } else if (m.type === 'audio') {
      lastMessage = '[Audio]'
    } else if (m.type === 'document') {
      lastMessage = '[Document]'
    } else if (m.type === 'sticker') {
      lastMessage = '[Sticker]'
    } else {
      lastMessage = '[Message]'
    }

    threadsMap.set(waId, {
      wa_id: waId,
      last_message: lastMessage,
      last_message_time: m.created_at
    })

    if (threadsMap.size >= 50) break
  }

  const waList = Array.from(threadsMap.keys())
  const { data: contacts } = await s.from("contacts").select("wa_id,display_name,profile_image_url,phone_e164").eq("tenant_id", user.id).in("wa_id", waList)
  const byWa: Record<string, any> = {}
  for (const c of contacts || []) byWa[(c as any).wa_id] = c

  // Only include threads for contacts that exist (not deleted)
  const threads = waList
    .map((waId) => {
      const contactInfo = byWa[waId]
      if (!contactInfo) return null // Skip deleted contacts

      return {
        wa_id: waId,
        display_name: contactInfo.display_name,
        profile_image_url: contactInfo.profile_image_url,
        phone_e164: contactInfo.phone_e164,
        last_message: threadsMap.get(waId)?.last_message || '',
        last_message_time: threadsMap.get(waId)?.last_message_time || new Date().toISOString()
      }
    })
    .filter(t => t !== null)

  if (threads.length < waList.length) {
    console.log(`[getThreads/fallback] Filtered out ${waList.length - threads.length} deleted contacts`)
  }
  return res.send({ threads })
})

app.get("/inbox/messages", async (req, res) => {
  const user = await requireAuth(req)
  const q: any = req.query || {}
  const waId = (q.wa_id || "").toString()
  if (!waId) return res.status(400).send({ error: "invalid_request" })
  const r = redis()
  const key = `inbox:messages:${user.id}:${waId}`
  const raw = await r.lrange(key, 0, 49)
  if (raw && raw.length > 0) {
    // Reverse the array because LPUSH stores newest-first but we want oldest-first
    const items = raw.map(x => JSON.parse(x)).reverse()
    console.log(`[DEBUG] Messages for ${waId}:`, items.map(m => ({
      id: m.id.substring(0, 20) + '...',
      dir: m.direction,
      ts_raw: m.timestamp,
      ts_formatted: new Date(m.timestamp).toLocaleTimeString(),
      ts_unix: Math.floor(m.timestamp / 1000)
    })))
    return res.send({ messages: items })
  }
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from("messages")
    .select("id, thread_id, direction, type, payload_json, created_at, conversation_id")
    .eq("tenant_id", user.id)
    .eq("thread_id", waId)
    .order("created_at", { ascending: true })  // Fix: Get oldest first, newest last
    .limit(50)
  // Map created_at to timestamp for consistency with Redis storage
  const messages = (data || []).map(msg => ({
    ...msg,
    timestamp: new Date(msg.created_at).getTime(),
    payload: msg.payload_json
  }))
  return res.send({ messages })
})

app.post("/messages/send", async (req, res) => {
  const user = await requireAuth(req)
  const body = (req.body ?? {}) as any
  const to = body.to
  const payload = body.payload
  const phoneNumberId = body.phone_number_id
  if (!to || !payload) return res.status(400).send({ error: "invalid_request" })
  if (phoneNumberId) {
    const s = supabaseAdmin()
    const { data } = await s
      .from("whatsapp_credentials")
      .select("phone_number_id")
      .eq("tenant_id", user.id)
      .eq("phone_number_id", phoneNumberId)
      .limit(1)
    if (!data || data.length === 0) return res.status(403).send({ error: "sender_not_owned" })
  }
  const r = redis()
  const rlKey = `rl:send:${user.id}`
  const count = await r.incr(rlKey)
  if (count === 1) await r.expire(rlKey, 60)
  if (count > 60) return res.status(429).send({ error: "rate_limited" })
  const q = queue(Queues.OutboundMessages)
  const job = await q.add("send", { tenant_id: user.id, phone_number_id: phoneNumberId, to, payload })
  return res.send({ enqueued: true, job_id: job.id })
})

app.post("/events/publish", async (req, res) => {
  await requireAuth(req)
  const body = (req.body ?? {}) as any
  const channel = body.channel
  const data = body.data
  if (!channel) return res.status(400).send({ error: "invalid_request" })
  publish(channel, data)
  return res.send({ published: true })
})

app.get("/messages/last", async (req, res) => {
  const user = await requireAuth(req)
  const q: any = req.query || {}
  const waId = (q.wa_id || "").toString()
  if (!waId) return res.status(400).send({ error: "invalid_request" })
  const r = redis()
  const key = `outbound:last:${user.id}:${waId}`
  const val = await r.get(key)
  if (!val) return res.send({})
  try { return res.send(JSON.parse(val)) } catch { return res.send({}) }
})

app.get("/last", async (req, res) => {
  const user = await requireAuth(req)
  const q: any = req.query || {}
  const waId = (q.wa_id || "").toString()
  if (!waId) return res.status(400).send({ error: "invalid_request" })
  const r = redis()
  const key = `outbound:last:${user.id}:${waId}`
  const val = await r.get(key)
  if (!val) return res.send({})
  try { return res.send(JSON.parse(val)) } catch { return res.send({}) }
})

 
 

// Auth schemas
const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2) })
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) })

// CSRF helper
function requireCsrf(req: any) {
  const headerToken = (req.headers["x-csrf-token"] as string) || (req.headers["csrf-token"] as string)
  const ok = verifyCsrfToken(req.cookies?.csrf_token, headerToken)
  if (!ok) throw app.httpErrors.forbidden("csrf_invalid")
}

async function requireAuth(req: any) {
  const token = req.cookies?.sb_access_token || (req.headers["authorization"] as string)?.replace("Bearer ", "")
  if (!token) throw app.httpErrors.unauthorized("missing_token")
  const auth = supabaseAuth()
  const { data, error } = await auth.auth.getUser(token)
  if (data?.user) return data.user
  try {
    const claims = verifyAccessToken(token)
    return { id: claims.sub as string, email: claims.email as string }
  } catch {
    throw app.httpErrors.unauthorized("token_invalid")
  }
}

// Signup (Supabase Auth + app user upsert)
app.post("/auth/signup", async (req, res) => {
  const body = signupSchema.safeParse(req.body)
  if (!body.success) return res.status(400).send({ error: "validation_error" })
  const email = body.data.email.trim().toLowerCase()
  const password = body.data.password
  const name = body.data.name.trim()
  const auth = supabaseAuth()
  const { data, error } = await auth.auth.signUp({ email, password, options: { data: { name } } })
  if (error) {
    await logAuth("signup", false, { reason: error.message, ip: req.ip, user_agent: req.headers["user-agent"] })
    return res.status(400).send({ error: "signup_failed" })
  }
  // Upsert into app-side auth_users
  const userId = data.user?.id
  if (userId) {
    const s = supabaseAdmin()
    const pwHash = await hashPassword(password)
    await s.from("auth_users").upsert({ id: userId, email, password_hash: pwHash, name }, { onConflict: "id" })
  }
  if (data.session) {
    const csrf = generateCsrfToken()
    const cookieSecure = process.env.COOKIE_SECURE === "1"
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined
    res.setCookie("sb_access_token", data.session.access_token, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
    if (data.session.refresh_token) {
      res.setCookie("sb_refresh_token", data.session.refresh_token, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
      const s = supabaseAdmin()
      await s.from("auth_refresh_tokens").upsert({
        user_id: userId,
        token_hash: sha256Hex(data.session.refresh_token),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        user_agent: req.headers["user-agent"],
        ip: req.ip
      })
    }
    res.setCookie("csrf_token", csrf, { secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
  }
  await logAuth("signup", true, { reason: "ok", ip: req.ip, user_agent: req.headers["user-agent"] })
  return res.status(201).send({ success: true, user: { id: userId, email, name }, message: "account_created" })
})

// Login (Supabase Auth + app user backfill/last_login)
app.post("/auth/login", async (req, res) => {
  const body = loginSchema.safeParse(req.body)
  if (!body.success) return res.status(400).send({ error: "validation_error" })
  const email = body.data.email.trim().toLowerCase()
  const password = body.data.password
  const auth = supabaseAuth()
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error) {
    await logAuth("login_failure", false, { reason: error.message, ip: req.ip, user_agent: req.headers["user-agent"] })
    return res.status(401).send({ error: "invalid_credentials" })
  }
  const session = data.session
  if (!session) return res.status(401).send({ error: "invalid_credentials" })
  const s = supabaseAdmin()
  // Backfill user row if missing; update last_login_at
  const { data: existing } = await s.from("auth_users").select("id").eq("id", session.user.id).limit(1)
  if (!existing || existing.length === 0) {
    const pwHash = await hashPassword(password)
    await s.from("auth_users").upsert({ id: session.user.id, email, password_hash: pwHash, name: session.user.user_metadata?.name }, { onConflict: "id" })
  }
  await s.from("auth_users").update({ last_login_at: new Date().toISOString() }).eq("id", session.user.id)
  const csrf = generateCsrfToken()
  const cookieSecure = process.env.COOKIE_SECURE === "1"
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  res.setCookie("sb_access_token", session.access_token, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
  if (session.refresh_token) {
    res.setCookie("sb_refresh_token", session.refresh_token, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
    await s.from("auth_refresh_tokens").upsert({
      user_id: session.user.id,
      token_hash: sha256Hex(session.refresh_token),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user_agent: req.headers["user-agent"],
      ip: req.ip
    })
  }
  res.setCookie("csrf_token", csrf, { secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
  await logAuth("login_success", true, { user_id: session.user.id, reason: "ok", ip: req.ip, user_agent: req.headers["user-agent"] })
  return res.send({ success: true, user: { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name }, message: "login_ok" })
})

// Recover
app.post("/auth/recover", async (req, res) => {
  const body = z.object({ email: z.string().email() }).safeParse(req.body)
  if (!body.success) return res.status(400).send({ error: "validation_error" })
  const auth = supabaseAuth()
  const { error } = await auth.auth.resetPasswordForEmail(body.data.email, { redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL })
  if (error) return res.status(400).send({ error: "recover_failed" })
  await logAuth("recover", true, { reason: "ok", ip: req.ip, user_agent: req.headers["user-agent"] })
  return res.send({ success: true })
})

// Logout
app.post("/auth/logout", async (req, res) => {
  requireCsrf(req)
  const user = await requireAuth(req)
  const s = supabaseAdmin()
  const refresh = req.cookies?.sb_refresh_token
  if (refresh) {
    await s.from("auth_refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", sha256Hex(refresh))
  }
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  res.clearCookie("sb_access_token", { path: "/", domain: cookieDomain })
  res.clearCookie("sb_refresh_token", { path: "/", domain: cookieDomain })
  res.clearCookie("csrf_token", { path: "/", domain: cookieDomain })
  await logAuth("logout", true, { user_id: user?.id, ip: req.ip, user_agent: req.headers["user-agent"] })
  return res.send({ success: true, message: "logout_ok" })
})

// Auth verify and profile (Supabase)
app.get("/auth/me", async (req, res) => {
  const token = req.cookies?.sb_access_token || (req.headers["authorization"] as string)?.replace("Bearer ", "")
  if (!token) return res.status(401).send({ error: "missing_token" })
  const auth = supabaseAuth()
  const { data, error } = await auth.auth.getUser(token)
  if (error || !data.user) return res.status(401).send({ error: "token_invalid" })
  return res.send({ id: data.user.id, email: data.user.email })
})

app.get("/auth/profile", async (req, res) => {
  const user = await requireAuth(req)
  const s = supabaseAdmin()
  const { data } = await s.from("auth_users").select("id,email,name").eq("id", user.id).limit(1)
  const row = data && data[0]
  return res.send({ id: user.id, email: row?.email || (user as any).email, name: row?.name || (user as any).user_metadata?.name || "" })
})

app.listen({ port: 4000, host: "0.0.0.0" })
app.ready(async err => {
  if (err) return
  const pub = redis()
  const sub = redis()
  try { (app as any).io.adapter(createRedisAdapter(pub, sub)) } catch {}

  // Set up Redis pub/sub to forward events to Socket.IO clients
  const rs = redis()
  rs.psubscribe("tenant:*:inbox", "tenant:*:pipeline")
  rs.on("pmessage", (_pattern, channel, message) => {
    try {
      const data = JSON.parse(message)
      app.log.info({ channel, event: (data || {}).event }, "sio_forward")
      ;(app as any).io?.to(channel).emit("event", data)
    } catch (err) {
      app.log.error({ error: (err as any)?.message }, "sio_forward_error")
    }
  })
  app.log.info("Redis pub/sub listener started for tenant:*:inbox and tenant:*:pipeline")

  ;(app as any).io.use(async (socket: any, next: any) => {
    const h = socket.handshake || {}
    const authHeader = (h.headers?.authorization || "") as string
    const cookieHeader = (h.headers?.cookie || "") as string
    const m = cookieHeader.match(/(?:^|; )sb_access_token=([^;]+)/)
    const token = m?.[1]? decodeURIComponent(m[1]):authHeader?.replace("Bearer ", "") ?? "";
    if (!token) return next(new Error("unauthorized"))
    const auth = supabaseAuth()
    const { data } = await auth.auth.getUser(token)
    if (data?.user) { socket.data = { user: data.user }; return next() }
    try { const claims = verifyAccessToken(token); socket.data = { user: { id: claims.sub, email: claims.email } }; return next() } catch { return next(new Error("unauthorized")) }
  })
  ;(app as any).io.on("connection", (socket: any) => {
    const user = socket.data?.user
    if (!user?.id) { socket.disconnect(true); return }
    app.log.info({ user_id: user.id, socket_id: socket.id }, "sio_connected")
    // Join both inbox and pipeline rooms
    socket.join(`tenant:${user.id}:inbox`)
    socket.join(`tenant:${user.id}:pipeline`)
    app.log.info({ user_id: user.id, rooms: [`tenant:${user.id}:inbox`, `tenant:${user.id}:pipeline`] }, "sio_joined_rooms")
  })
})
// Short-lived token for WebSocket auth via query param (dev-friendly)
app.get("/auth/ws-token", async (req, res) => {
  const user = await requireAuth(req)
  const token = signAccessToken({ sub: user.id, email: (user as any).email || "" })
  return res.send({ token })
})
// OAuth redirect callback helper – shows the code and optional auto-complete
app.get("/auth/whatsapp/callback", async (req, res) => {
  const q: any = (req.query || {})
  const code = q.code || ""
  const wabaId = q.waba_id || ""
  const frontendBase = process.env.FRONTEND_BASE_URL || "http://localhost:3000"
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>WhatsApp Connected</title><style>
  body{margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;color:#0f172a}
  .wrap{max-width:720px;margin:56px auto;padding:0 20px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.06);padding:32px}
  .title{font-weight:700;font-size:24px;margin:0 0 6px}
  .desc{font-size:14px;color:#475569;margin:0 0 16px}
  .row{display:flex;align-items:center;gap:12px}
  .spinner{width:28px;height:28px;border-radius:50%;border:3px solid #e2e8f0;border-top-color:#7c3aed;animation:spin 1s linear infinite}
  .error{color:#dc2626}
  @keyframes spin{to{transform:rotate(360deg)}}
  </style></head><body>
  <div class=\"wrap\"><div class=\"card\">
    <div class=\"title\" id=\"title\">WhatsApp connected</div>
    <div class=\"desc\" id=\"desc\">Your account has been configured. Redirecting…</div>
    <div class=\"row\" id=\"loading\"><div class=\"spinner\"></div><div class=\"desc\">Please wait</div></div>
  </div></div>
  <script>
    function getCookie(name){ var m=document.cookie.match(new RegExp('(?:^|; )'+name+'=([^;]+)')); return m?decodeURIComponent(m[1]):'' }
    var csrf = getCookie('csrf_token')
    var code = ${JSON.stringify(code)}
    var wabaId = ${JSON.stringify(wabaId)}
    var baseUrl = ${JSON.stringify(frontendBase)}
    function go(error){
      var url = baseUrl + '/settings?onboarded=1'
      if (error) url = baseUrl + '/settings?error=' + encodeURIComponent(error)
      setTimeout(function(){ window.location.href = url }, 2000)
    }
    function showError(msg) {
      document.getElementById('title').textContent = 'Connection Failed'
      document.getElementById('title').classList.add('error')
      document.getElementById('desc').textContent = msg
      document.getElementById('loading').innerHTML = '<div class="desc">Redirecting...</div>'
    }
    if (code && csrf) {
      fetch('/api/whatsapp/complete-onboarding', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ code: code, waba_id: wabaId || undefined })
      }).then(function(r){
        if (r.ok) return r.json()
        return r.json().then(function(d){ throw d })
      })
        .then(function(){ go() })
        .catch(function(err){
          if (err && err.error === 'phone_already_connected') {
            showError('This WhatsApp account is already connected to another user')
            go('already_connected')
          } else {
            showError('Failed to connect WhatsApp')
            go('failed')
          }
        })
    } else {
      go()
    }
  </script>
  </body></html>`
  res.header('content-security-policy', "default-src 'none';connect-src 'self';img-src 'self';style-src 'self' 'unsafe-inline';script-src 'self' 'unsafe-inline';base-uri 'self';frame-ancestors 'self';object-src 'none'")
  res.header('content-type','text/html; charset=utf-8').send(html)
})
// Refresh using Supabase refresh token
app.post("/auth/refresh", async (req, res) => {
  requireCsrf(req)
  const refresh = req.cookies?.sb_refresh_token
  if (!refresh) return res.status(401).send({ error: "missing_refresh" })
  const url = `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
  const r = await fetch(url, {
    method: "POST",
    headers: { "apikey": process.env.SUPABASE_ANON_KEY || "", "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh })
  })
  if (!r.ok) return res.status(401).send({ error: "refresh_failed" })
  const json: any = await r.json()
  const access = json.access_token
  const newRefresh = json.refresh_token
  const userId = json.user?.id
  const cookieSecure = process.env.COOKIE_SECURE === "1"
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  res.setCookie("sb_access_token", access, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
  if (newRefresh) {
    res.setCookie("sb_refresh_token", newRefresh, { httpOnly: true, secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
    const s = supabaseAdmin()
    await s.from("auth_refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", sha256Hex(refresh))
    await s.from("auth_refresh_tokens").upsert({
      user_id: userId,
      token_hash: sha256Hex(newRefresh),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user_agent: req.headers["user-agent"],
      ip: req.ip
    })
  }
  await logAuth("refresh", true, { user_id: userId, reason: "ok", ip: req.ip, user_agent: req.headers["user-agent"] })
  return res.send({ success: true, message: "refresh_ok" })
})

import { FastifyAdapter } from "@bull-board/fastify"
import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
const serverAdapter = new FastifyAdapter()
serverAdapter.setBasePath("/admin/queues")
createBullBoard({
  queues: [new BullMQAdapter(queue(Queues.OutboundMessages)), new BullMQAdapter(queue(Queues.InboundEvents))],
  serverAdapter
})
app.register(serverAdapter.registerPlugin(), { prefix: "/admin/queues" })
app.addHook("onRequest", async (req, res) => { if (req.url.startsWith("/admin/queues")) await requireAuth(req) })

app.get("/contacts/:wa_id", async (req, res) => {
  const user = await requireAuth(req)
  const waId = (req.params as any)?.wa_id || ""
  if (!waId) return res.status(400).send({ error: "invalid_request" })
  const s = supabaseAdmin()
  const { data } = await s.from("contacts").select("wa_id,display_name,profile_image_url,tags,origin,phone_e164").eq("tenant_id", user.id).eq("wa_id", waId).limit(1)
  const row = data && data[0]
  if (!row) return res.status(404).send({ error: "not_found" })
  return res.send(row)
})

app.post("/contacts", async (req, res) => {
  const user = await requireAuth(req)
  const body = (req.body ?? {}) as any
  const waId = (body.wa_id || "").toString()
  const displayName = (body.display_name || "").toString()
  const phone = (body.phone_e164 || "").toString()
  if (!waId) return res.status(400).send({ error: "validation_error" })
  const s = supabaseAdmin()
  const { error } = await s
    .from("contacts")
    .upsert({ tenant_id: user.id, wa_id: waId, origin: "manual", display_name: displayName || waId, phone_e164: phone || null }, { onConflict: "tenant_id,wa_id" })
  if (error) return res.status(500).send({ error: "save_failed" })
  return res.send({ success: true })
})

app.get("/contacts", async (req, res) => {
  const user = await requireAuth(req)
  const s = supabaseAdmin()
  const { data } = await s
    .from("contacts")
    .select("wa_id,display_name,profile_image_url,tags,origin,phone_e164,company,hidden_from_inbox")
    .eq("tenant_id", user.id)
    .or("hidden_from_inbox.is.null,hidden_from_inbox.eq.false")
    .limit(200)
  return res.send({ contacts: data || [] })
})

// DELETE conversation - permanently delete contact (keep messages for history)
app.delete("/conversations/:wa_id", async (req, res) => {
  const user = await requireAuth(req)
  const waId = (req.params as any)?.wa_id || ""
  if (!waId) return res.status(400).send({ error: "invalid_request" })

  const s = supabaseAdmin()
  const r = redis()

  // 1. Find the contact first
  const { data: contact } = await s
    .from("contacts")
    .select("id, wa_id")
    .eq("tenant_id", user.id)
    .eq("wa_id", waId)
    .limit(1)

  if (!contact || contact.length === 0) {
    return res.status(404).send({ error: "contact_not_found" })
  }

  const contactId = contact[0].id

  // 2. Check if contact has a deal in pipeline
  const { data: deal } = await s
    .from("deals")
    .select("id")
    .eq("tenant_id", user.id)
    .eq("contact_id", contactId)
    .limit(1)

  // 3. If contact is in pipeline, delete the deal first (and publish event)
  if (deal && deal.length > 0) {
    const dealId = deal[0].id
    await s.from("deals").delete().eq("id", dealId)
    // Publish event to update pipeline in real-time
    publishPipelineEvent(user.id, "deal_deleted", { deal_id: dealId })
    console.log(`[Pipeline] Deal ${dealId} deleted due to contact deletion`)
  }

  // 4. Delete the contact from database (permanent delete)
  const { error: deleteError } = await s
    .from("contacts")
    .delete()
    .eq("tenant_id", user.id)
    .eq("wa_id", waId)

  if (deleteError) {
    console.error('Delete contact error:', deleteError)
    return res.status(500).send({ error: "delete_failed" })
  }

  // 5. Remove from Redis inbox threads
  const threadKey = `inbox:threads:${user.id}`
  const removedFromThreads = await r.zrem(threadKey, waId)
  console.log(`[Delete] Removed ${removedFromThreads} items from Redis threads for wa_id: ${waId}`)

  // 6. Clear any cached messages for this thread
  const cacheKey = `inbox:msg:${user.id}:${waId}`
  await r.del(cacheKey)
  console.log(`[Delete] Cleared Redis cache for ${cacheKey}`)

  // 7. Add to "deleted contacts" list to prevent re-creation
  const deletedKey = `inbox:deleted:${user.id}:${waId}`
  await r.set(deletedKey, '1', 'EX', 3600) // Expire in 1 hour
  console.log(`[Delete] Marked wa_id ${waId} as deleted for 1 hour`)

  // 8. Clear pipeline cache
  await invalidatePipelineCache(user.id)
  console.log(`[Delete] Cleared pipeline cache for tenant: ${user.id}`)

  console.log(`[Delete] Successfully deleted conversation for wa_id: ${waId}`)
  return res.send({ success: true, message: "Conversation permanently deleted" })
})

// Restore conversation (unhide from inbox)
app.post("/conversations/:wa_id/restore", async (req, res) => {
  const user = await requireAuth(req)
  const waId = (req.params as any)?.wa_id || ""
  if (!waId) return res.status(400).send({ error: "invalid_request" })

  const s = supabaseAdmin()
  const r = redis()

  // 1. Unhide contact
  const { error } = await s
    .from("contacts")
    .update({ hidden_from_inbox: false })
    .eq("tenant_id", user.id)
    .eq("wa_id", waId)

  if (error) return res.status(500).send({ error: "update_failed" })

  // 2. Add back to Redis inbox threads
  const threadKey = `inbox:threads:${user.id}`
  await r.zadd(threadKey, Date.now(), waId)

  return res.send({ success: true })
})

app.get("/media/list", async (req, res) => {
  const user = await requireAuth(req)
  const q: any = req.query || {}
  const messageId = (q.message_id || "").toString()
  const waId = (q.wa_id || "").toString()
  const s = supabaseAdmin()
  if (messageId) {
    const { data } = await s.from("message_media").select("id,kind,bucket_path,stored_url,content_type,size,sha256,created_at").eq("tenant_id", user.id).eq("message_id", messageId)
    return res.send({ media: data || [] })
  }
  if (waId) {
    const { data } = await s.from("messages").select("id").eq("tenant_id", user.id).eq("thread_id", waId).limit(200)
    const ids = (data || []).map((d: any) => d.id)
    if (ids.length === 0) return res.send({ media: [] })
    const { data: mm } = await s.from("message_media").select("id,kind,bucket_path,stored_url,content_type,size,sha256,created_at,message_id").eq("tenant_id", user.id).in("message_id", ids)
    return res.send({ media: mm || [] })
  }
  return res.status(400).send({ error: "invalid_request" })
})

app.get("/media/signed", async (req, res) => {
  const user = await requireAuth(req)
  const q: any = req.query || {}
  const id = (q.id || "").toString()
  const s = supabaseAdmin()
  const { data } = await s.from("message_media").select("bucket_path,stored_url").eq("tenant_id", user.id).eq("id", id).limit(1)
  const row = data && data[0]
  if (!row) return res.status(404).send({ error: "not_found" })
  const path = (row as any).bucket_path
  try {
    const r = await s.storage.from("media").createSignedUrl(path, 600)
    if ((r as any).error) return res.status(500).send({ error: "sign_failed" })
    return res.send({ url: (r as any).data?.signedUrl || (row as any).stored_url })
  } catch {
    return res.send({ url: (row as any).stored_url })
  }
})

// ============================================
// PIPELINE API ROUTES (with Redis caching + WebSocket)
// ============================================

// Helper: Publish pipeline event to WebSocket
function publishPipelineEvent(tenantId: string, event: string, data: any) {
  const channel = `tenant:${tenantId}:pipeline`
  const r = redis()
  r.publish(channel, JSON.stringify({ event, ...data }))
}

// Helper: Get deals from cache or DB
async function getDealsWithCache(tenantId: string): Promise<{ deals: any[]; stages: any[] }> {
  const r = redis()
  const cacheKey = `pipeline:deals:${tenantId}`
  const stagesCacheKey = `pipeline:stages:${tenantId}`

  // Try to get from cache first
  const [cachedDeals, cachedStages] = await Promise.all([
    r.get(cacheKey),
    r.get(stagesCacheKey)
  ])

  if (cachedDeals && cachedStages) {
    return {
      deals: JSON.parse(cachedDeals),
      stages: JSON.parse(cachedStages)
    }
  }

  // Cache miss - fetch from DB
  const s = supabaseAdmin()

  // Get stages (with auto-create if none exist)
  let { data: stages } = await s
    .from("pipeline_stages")
    .select("id, name, ord")
    .eq("tenant_id", tenantId)
    .order("ord", { ascending: true })

  if (!stages || stages.length === 0) {
    const defaultStages = [
      { tenant_id: tenantId, name: "New", ord: 1 },
      { tenant_id: tenantId, name: "Active", ord: 2 },
      { tenant_id: tenantId, name: "Follow Up", ord: 3 },
      { tenant_id: tenantId, name: "Converted", ord: 4 }
    ]
    const { data: created } = await s
      .from("pipeline_stages")
      .insert(defaultStages)
      .select("id, name, ord")
    stages = created || []
  }

  // Get deals
  const { data: deals } = await s
    .from("deals")
    .select("id, value, notes, tags, stage_id, contact_id, created_at")
    .eq("tenant_id", tenantId)

  // Get contacts for deals
  const contactIds = (deals || []).map(d => d.contact_id).filter(Boolean)
  let contactMap: Record<number, any> = {}

  if (contactIds.length > 0) {
    const { data: contacts } = await s
      .from("contacts")
      .select("id, wa_id, display_name, profile_image_url, phone_e164, tags, company")
      .in("id", contactIds)

    for (const c of contacts || []) {
      contactMap[c.id] = c
    }
  }

  // Build stage map
  const stageMap: Record<number, any> = {}
  for (const stage of stages || []) {
    stageMap[stage.id] = stage
  }

  // Enrich deals
  const enrichedDeals = (deals || []).map(deal => ({
    ...deal,
    contact: contactMap[deal.contact_id] || null,
    stage: stageMap[deal.stage_id] || null
  }))

  // Cache for 5 minutes (300 seconds)
  await Promise.all([
    r.setex(cacheKey, 300, JSON.stringify(enrichedDeals)),
    r.setex(stagesCacheKey, 300, JSON.stringify(stages))
  ])

  return { deals: enrichedDeals, stages: stages || [] }
}

// Helper: Invalidate pipeline cache
async function invalidatePipelineCache(tenantId: string) {
  const r = redis()
  await Promise.all([
    r.del(`pipeline:deals:${tenantId}`),
    r.del(`pipeline:stages:${tenantId}`)
  ])
}

// Pipeline Stages - GET all stages for tenant
app.get("/api/pipeline/stages", async (req, res) => {
  const user = await requireAuth(req)
  const { stages } = await getDealsWithCache(user.id)
  return res.send({ stages })
})

// Deals - GET all deals for tenant (from cache)
app.get("/api/deals", async (req, res) => {
  const user = await requireAuth(req)
  const data = await getDealsWithCache(user.id)
  return res.send(data)
})

// Deals - POST create new deal (also creates contact if needed)
app.post("/api/deals", async (req, res) => {
  const user = await requireAuth(req)
  const body = (req.body ?? {}) as any
  const { name, phone, company, value, notes, tags, stage_name } = body

  if (!name || !phone) {
    return res.status(400).send({ error: "validation_error", message: "name and phone are required" })
  }

  const s = supabaseAdmin()
  const r = redis()

  // Normalize phone to wa_id format (remove non-digits)
  const waId = phone.replace(/\D/g, "")

  // 1. Create or find contact
  const { data: existingContact } = await s
    .from("contacts")
    .select("id, wa_id, display_name, profile_image_url, phone_e164, company")
    .eq("tenant_id", user.id)
    .eq("wa_id", waId)
    .limit(1)

  let contactId: number
  let contactInfo: any

  if (existingContact && existingContact.length > 0) {
    contactId = existingContact[0].id
    contactInfo = existingContact[0]

    // Update company if provided and different
    if (company && company !== existingContact[0].company) {
      await s.from("contacts").update({ company }).eq("id", contactId)
      contactInfo.company = company
    }
  } else {
    // Create new contact with company
    const { data: newContact, error: contactErr } = await s
      .from("contacts")
      .insert({
        tenant_id: user.id,
        wa_id: waId,
        display_name: name,
        phone_e164: phone,
        origin: "pipeline",
        company: company || null,
        tags: tags || []
      })
      .select("id, wa_id, display_name, profile_image_url, phone_e164, company")
      .single()

    if (contactErr || !newContact) {
      return res.status(500).send({ error: "contact_create_failed" })
    }
    contactId = newContact.id
    contactInfo = newContact

    // Also add to inbox threads so Pipeline→Inbox sync works
    const threadKey = `inbox:threads:${user.id}`
    await r.zadd(threadKey, Date.now(), waId)
  }

  // 2. Get stage ID from stage_name (default to "New")
  const stageName = stage_name || "New"
  let { data: stageData } = await s
    .from("pipeline_stages")
    .select("id")
    .eq("tenant_id", user.id)
    .eq("name", stageName)
    .limit(1)

  let stageId: number | null = null
  if (stageData && stageData.length > 0) {
    stageId = stageData[0].id
  } else {
    // Create default stages if they don't exist
    const defaultStages = [
      { tenant_id: user.id, name: "New", ord: 1 },
      { tenant_id: user.id, name: "Active", ord: 2 },
      { tenant_id: user.id, name: "Follow Up", ord: 3 },
      { tenant_id: user.id, name: "Converted", ord: 4 }
    ]
    await s.from("pipeline_stages").upsert(defaultStages, { onConflict: "tenant_id,name" })

    const { data: newStage } = await s
      .from("pipeline_stages")
      .select("id")
      .eq("tenant_id", user.id)
      .eq("name", stageName)
      .limit(1)

    if (newStage && newStage.length > 0) {
      stageId = newStage[0].id
    }
  }

  // 3. Create the deal
  const { data: deal, error: dealErr } = await s
    .from("deals")
    .insert({
      tenant_id: user.id,
      contact_id: contactId,
      stage_id: stageId,
      value: value || 0,
      notes: notes || "",
      tags: tags || []
    })
    .select("id, value, notes, tags, stage_id, contact_id, created_at")
    .single()

  if (dealErr) {
    return res.status(500).send({ error: "deal_create_failed" })
  }

  const enrichedDeal = {
    ...deal,
    contact: contactInfo,
    stage: { id: stageId, name: stageName }
  }

  // Invalidate cache and publish event
  await invalidatePipelineCache(user.id)
  publishPipelineEvent(user.id, "deal_created", { deal: enrichedDeal })

  return res.status(201).send({ success: true, deal: enrichedDeal })
})

// Deals - PUT update deal (including stage changes)
app.put("/api/deals/:id", async (req, res) => {
  const user = await requireAuth(req)
  const dealId = (req.params as any).id
  const body = (req.body ?? {}) as any
  const { value, notes, tags, stage_id, stage_name } = body

  if (!dealId) return res.status(400).send({ error: "invalid_request" })

  const s = supabaseAdmin()

  // Verify deal belongs to tenant and get current data
  const { data: existing } = await s
    .from("deals")
    .select("id, contact_id, stage_id")
    .eq("id", dealId)
    .eq("tenant_id", user.id)
    .limit(1)

  if (!existing || existing.length === 0) {
    return res.status(404).send({ error: "not_found" })
  }

  // Build update object
  const updates: any = {}
  if (value !== undefined) updates.value = value
  if (notes !== undefined) updates.notes = notes
  if (tags !== undefined) updates.tags = tags

  let newStageName = stage_name

  // Handle stage update by name or ID
  if (stage_name) {
    const { data: stageData } = await s
      .from("pipeline_stages")
      .select("id, name")
      .eq("tenant_id", user.id)
      .eq("name", stage_name)
      .limit(1)

    if (stageData && stageData.length > 0) {
      updates.stage_id = stageData[0].id
      newStageName = stageData[0].name
    }
  } else if (stage_id !== undefined) {
    updates.stage_id = stage_id
    // Get stage name for the event
    const { data: stageData } = await s
      .from("pipeline_stages")
      .select("name")
      .eq("id", stage_id)
      .limit(1)
    if (stageData && stageData.length > 0) {
      newStageName = stageData[0].name
    }
  }

  const { data: updated, error } = await s
    .from("deals")
    .update(updates)
    .eq("id", dealId)
    .eq("tenant_id", user.id)
    .select("id, value, notes, tags, stage_id, contact_id, created_at")
    .single()

  if (error) return res.status(500).send({ error: "update_failed" })

  // Get contact info for the event
  const { data: contactInfo } = await s
    .from("contacts")
    .select("id, wa_id, display_name, profile_image_url, phone_e164, company")
    .eq("id", updated.contact_id)
    .single()

  const enrichedDeal = {
    ...updated,
    contact: contactInfo,
    stage: { id: updated.stage_id, name: newStageName }
  }

  // Invalidate cache and publish event
  await invalidatePipelineCache(user.id)
  publishPipelineEvent(user.id, "deal_updated", { deal: enrichedDeal })

  return res.send({ success: true, deal: enrichedDeal })
})

// Deals - DELETE a deal
app.delete("/api/deals/:id", async (req, res) => {
  const user = await requireAuth(req)
  const dealId = (req.params as any).id

  if (!dealId) return res.status(400).send({ error: "invalid_request" })

  const s = supabaseAdmin()

  // Get deal info before deleting for the event
  const { data: dealToDelete } = await s
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .eq("tenant_id", user.id)
    .limit(1)

  if (!dealToDelete || dealToDelete.length === 0) {
    return res.status(404).send({ error: "not_found" })
  }

  const { error } = await s
    .from("deals")
    .delete()
    .eq("id", dealId)
    .eq("tenant_id", user.id)

  if (error) return res.status(500).send({ error: "delete_failed" })

  // Invalidate cache and publish event
  await invalidatePipelineCache(user.id)
  publishPipelineEvent(user.id, "deal_deleted", { deal_id: parseInt(dealId) })

  return res.send({ success: true })
})

// Add contact to pipeline (creates deal for existing inbox contact)
app.post("/api/pipeline/add-contact", async (req, res) => {
  const user = await requireAuth(req)
  const body = (req.body ?? {}) as any
  const { wa_id, value, stage_name } = body

  if (!wa_id) return res.status(400).send({ error: "wa_id_required" })

  const s = supabaseAdmin()

  // Find contact
  const { data: contact } = await s
    .from("contacts")
    .select("id, wa_id, display_name, profile_image_url, phone_e164, company")
    .eq("tenant_id", user.id)
    .eq("wa_id", wa_id)
    .limit(1)

  if (!contact || contact.length === 0) {
    return res.status(404).send({ error: "contact_not_found" })
  }

  const contactId = contact[0].id

  // Check if deal already exists for this contact
  const { data: existingDeal } = await s
    .from("deals")
    .select("id")
    .eq("tenant_id", user.id)
    .eq("contact_id", contactId)
    .limit(1)

  if (existingDeal && existingDeal.length > 0) {
    return res.status(400).send({ error: "already_in_pipeline", deal_id: existingDeal[0].id })
  }

  // Get stage
  const stageName = stage_name || "New"
  const { data: stageData } = await s
    .from("pipeline_stages")
    .select("id")
    .eq("tenant_id", user.id)
    .eq("name", stageName)
    .limit(1)

  const stageId = stageData && stageData.length > 0 ? stageData[0].id : null

  // Create deal
  const { data: deal, error } = await s
    .from("deals")
    .insert({
      tenant_id: user.id,
      contact_id: contactId,
      stage_id: stageId,
      value: value || 0,
      notes: "",
      tags: []
    })
    .select("id, value, stage_id, contact_id, created_at")
    .single()

  if (error) return res.status(500).send({ error: "create_failed" })

  const enrichedDeal = {
    ...deal,
    contact: contact[0],
    stage: { id: stageId, name: stageName }
  }

  // Invalidate cache and publish event
  await invalidatePipelineCache(user.id)
  publishPipelineEvent(user.id, "deal_created", { deal: enrichedDeal })

  return res.status(201).send({ success: true, deal: enrichedDeal })
})
