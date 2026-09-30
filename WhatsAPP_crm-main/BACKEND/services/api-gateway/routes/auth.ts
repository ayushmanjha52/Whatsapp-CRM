import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin } from "../../../src/common/db"
import { supabaseAuth } from "../../../src/common/supabaseAuth"
import { env } from "../../../src/common/config"
import { logAuth } from "../../../src/auth/log"
import { sha256Hex } from "../../../src/auth/token"
import {
  authenticate, clearSessionCookies, csrfGuard, invalidateAuth, issueCsrf, resolveAuth,
  resolveMembership, setSessionCookies, tokenFromRequest
} from "../../../src/http/auth"
import { badRequest, parse, unauthorized } from "../../../src/http/errors"

const credentialLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } }

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  name: z.string().trim().min(2).max(80)
})
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })

async function recordRefreshToken(userId: string, refreshToken: string | null | undefined, req: any) {
  if (!refreshToken) return
  await supabaseAdmin().from("auth_refresh_tokens").upsert({
    user_id: userId,
    token_hash: sha256Hex(refreshToken),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    user_agent: req.headers["user-agent"],
    ip: req.ip
  }, { onConflict: "user_id,token_hash" })
}

async function sessionPayload(token: string) {
  const ctx = await resolveAuth(token)
  const { data: tenant } = await supabaseAdmin().from("tenants").select("name").eq("id", ctx.tenantId).maybeSingle()
  return {
    user: {
      id: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      role: ctx.role,
      tenant_id: ctx.tenantId,
      tenant_name: tenant?.name || ""
    }
  }
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/signup", { config: credentialLimit }, async (req, res) => {
    const body = parse(signupSchema, req.body)
    const { data, error } = await supabaseAuth().auth.signUp({
      email: body.email,
      password: body.password,
      options: { data: { name: body.name }, emailRedirectTo: env.FRONTEND_BASE_URL }
    })
    if (error || !data.user) {
      await logAuth("signup", false, { reason: error?.message, ip: req.ip, user_agent: req.headers["user-agent"] })
      throw badRequest("signup_failed", error?.message || "Could not create the account")
    }
    await supabaseAdmin().from("auth_users").upsert({ id: data.user.id, email: body.email, name: body.name }, { onConflict: "id" })
    await resolveMembership(data.user.id, body.email, body.name)
    await logAuth("signup", true, { user_id: data.user.id, ip: req.ip, user_agent: req.headers["user-agent"] })

    if (!data.session) {
      return res.status(201).send({ needs_confirmation: true, message: "Check your inbox to confirm your email, then sign in." })
    }
    setSessionCookies(res, data.session)
    await recordRefreshToken(data.user.id, data.session.refresh_token, req)
    return res.status(201).send(await sessionPayload(data.session.access_token))
  })

  app.post("/login", { config: credentialLimit }, async (req, res) => {
    const body = parse(loginSchema, req.body)
    const { data, error } = await supabaseAuth().auth.signInWithPassword({ email: body.email, password: body.password })
    if (error || !data.session) {
      await logAuth("login_failure", false, { reason: error?.message, ip: req.ip, user_agent: req.headers["user-agent"] })
      if (error?.message?.toLowerCase().includes("email not confirmed")) {
        throw unauthorized("email_not_confirmed", "Please confirm your email address first")
      }
      throw unauthorized("invalid_credentials", "Email or password is incorrect")
    }
    const user = data.session.user
    const s = supabaseAdmin()
    await s.from("auth_users").upsert(
      { id: user.id, email: body.email, name: (user.user_metadata as any)?.name, last_login_at: new Date().toISOString() },
      { onConflict: "id" }
    )
    setSessionCookies(res, data.session)
    await recordRefreshToken(user.id, data.session.refresh_token, req)
    await logAuth("login_success", true, { user_id: user.id, ip: req.ip, user_agent: req.headers["user-agent"] })
    return res.send(await sessionPayload(data.session.access_token))
  })

  app.post("/recover", { config: credentialLimit }, async (req, res) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body)
    const { error } = await supabaseAuth().auth.resetPasswordForEmail(body.email, {
      redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL || `${env.FRONTEND_BASE_URL}/login`
    })
    await logAuth("recover", !error, { reason: error?.message, ip: req.ip, user_agent: req.headers["user-agent"] })
    // Same response either way, so the endpoint cannot be used to discover accounts.
    return res.send({ success: true })
  })

  app.get("/session", async (req, res) => {
    const token = tokenFromRequest(req)
    const payload = await sessionPayload(token || "")
    if (!(req.cookies as any)?.csrf_token) issueCsrf(res)
    return res.send(payload)
  })

  app.post("/refresh", { preHandler: csrfGuard }, async (req, res) => {
    const refresh = (req.cookies as any)?.sb_refresh_token
    if (!refresh) throw unauthorized("missing_refresh")
    const { data, error } = await supabaseAuth().auth.refreshSession({ refresh_token: refresh })
    if (error || !data.session) {
      clearSessionCookies(res)
      throw unauthorized("refresh_failed")
    }
    setSessionCookies(res, data.session)
    const s = supabaseAdmin()
    await s.from("auth_refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", sha256Hex(refresh))
    await recordRefreshToken(data.session.user.id, data.session.refresh_token, req)
    return res.send({ success: true })
  })

  app.post("/logout", { preHandler: csrfGuard }, async (req, res) => {
    const token = tokenFromRequest(req)
    const refresh = (req.cookies as any)?.sb_refresh_token
    if (refresh) {
      await supabaseAdmin().from("auth_refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", sha256Hex(refresh))
    }
    let userId: string | undefined
    try { userId = (await resolveAuth(token)).userId } catch {}
    invalidateAuth(token)
    clearSessionCookies(res)
    await logAuth("logout", true, { user_id: userId, ip: req.ip, user_agent: req.headers["user-agent"] })
    return res.send({ success: true })
  })

  app.patch("/profile", { preHandler: [authenticate, csrfGuard] }, async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body)
    const s = supabaseAdmin()
    const { error } = await s.auth.admin.updateUserById(req.auth.userId, { user_metadata: { name: body.name } })
    if (error) throw badRequest("profile_update_failed", error.message)
    await s.from("auth_users").update({ name: body.name }).eq("id", req.auth.userId)
    await s.from("tenant_members").update({ name: body.name }).eq("user_id", req.auth.userId)
    invalidateAuth(tokenFromRequest(req))
    return res.send(await sessionPayload(tokenFromRequest(req) || ""))
  })

  app.post("/password", { preHandler: [authenticate, csrfGuard], config: credentialLimit }, async (req, res) => {
    const body = parse(z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(128) }), req.body)
    const check = await supabaseAuth().auth.signInWithPassword({ email: req.auth.email, password: body.current_password })
    if (check.error) throw badRequest("current_password_incorrect", "Your current password is incorrect")
    const { error } = await supabaseAdmin().auth.admin.updateUserById(req.auth.userId, { password: body.new_password })
    if (error) throw badRequest("password_update_failed", error.message)
    await logAuth("password_changed", true, { user_id: req.auth.userId, ip: req.ip, user_agent: req.headers["user-agent"] })
    return res.send({ success: true })
  })
}
