import type { FastifyReply, FastifyRequest } from "fastify"
import crypto from "crypto"
import { supabaseAdmin } from "../common/db"
import { supabaseAuth } from "../common/supabaseAuth"
import { env } from "../common/config"
import { sha256Hex } from "../auth/token"
import { generateCsrfToken, verifyCsrfToken } from "../auth/csrf"
import { forbidden, unauthorized } from "./errors"

export type Role = "admin" | "agent"

export type AuthContext = {
  userId: string
  email: string
  name: string
  tenantId: string
  role: Role
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext
  }
}

const CACHE_TTL_MS = 60_000
const CACHE_MAX = 5000
const cache = new Map<string, { ctx: AuthContext; exp: number }>()

export function tokenFromRequest(req: FastifyRequest): string | null {
  const cookie = (req.cookies as any)?.sb_access_token
  if (cookie) return cookie
  const header = req.headers.authorization || ""
  return header.startsWith("Bearer ") ? header.slice(7) : null
}

export function tokenFromCookieHeader(cookieHeader: string | undefined, authHeader?: string): string | null {
  const m = (cookieHeader || "").match(/(?:^|;\s*)sb_access_token=([^;]+)/)
  if (m?.[1]) return decodeURIComponent(m[1])
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
}

export function invalidateAuth(token: string | null | undefined) {
  if (token) cache.delete(sha256Hex(token))
}

/** Verifies a Supabase access token and resolves the caller's tenant and role. */
export async function resolveAuth(token: string | null): Promise<AuthContext> {
  if (!token) throw unauthorized("missing_token")
  const key = sha256Hex(token)
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.ctx

  const { data, error } = await supabaseAuth().auth.getUser(token)
  if (error || !data?.user) throw unauthorized("token_invalid")
  const user = data.user
  const email = (user.email || "").toLowerCase()
  const name = (user.user_metadata as any)?.name || email.split("@")[0] || ""
  const membership = await resolveMembership(user.id, email, name)
  const ctx: AuthContext = { userId: user.id, email, name, ...membership }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { ctx, exp: Date.now() + CACHE_TTL_MS })
  return ctx
}

/**
 * A user belongs to exactly one workspace. Pending invites are accepted automatically,
 * and a team workspace takes precedence over the user's personal one.
 * Personal workspaces use tenant_id = user id, which matches all pre-existing data.
 */
export async function resolveMembership(userId: string, email: string, name: string): Promise<{ tenantId: string; role: Role }> {
  const s = supabaseAdmin()

  if (email) {
    const { data: invites } = await s
      .from("tenant_members")
      .select("id")
      .eq("status", "invited")
      .ilike("email", email)
    if (invites && invites.length > 0) {
      await s
        .from("tenant_members")
        .update({ user_id: userId, status: "active", name })
        .in("id", invites.map((i: any) => i.id))
    }
  }

  const { data: active, error } = await s
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
  if (error) throw new Error(`membership_lookup_failed: ${error.message}`)

  const team = (active || []).find((m: any) => m.tenant_id !== userId)
  const own = (active || []).find((m: any) => m.tenant_id === userId)
  const chosen = team || own
  if (chosen) return { tenantId: chosen.tenant_id, role: chosen.role }

  await s.from("tenants").upsert({ id: userId, name: name || email || userId, status: "active" }, { onConflict: "id", ignoreDuplicates: true })
  await s.from("tenant_members").upsert(
    { tenant_id: userId, user_id: userId, email: email || userId, name, role: "admin", status: "active" },
    { onConflict: "tenant_id,email" }
  )
  return { tenantId: userId, role: "admin" }
}

export async function authenticate(req: FastifyRequest) {
  req.auth = await resolveAuth(tokenFromRequest(req))
}

export function requireAdmin(req: FastifyRequest) {
  if (req.auth?.role !== "admin") throw forbidden("admin_only", "Only workspace admins can do this")
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Double-submit CSRF check for every state-changing request. */
export async function csrfGuard(req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return
  const header = (req.headers["x-csrf-token"] as string) || (req.headers["csrf-token"] as string)
  if (!verifyCsrfToken((req.cookies as any)?.csrf_token, header)) throw forbidden("csrf_invalid")
}

// ---------- cookies ----------

const DAY = 24 * 3600

function cookieBase() {
  return { secure: env.COOKIE_SECURE, sameSite: "strict" as const, path: "/", domain: env.COOKIE_DOMAIN }
}

export function setSessionCookies(res: FastifyReply, session: { access_token: string; refresh_token?: string | null }) {
  res.setCookie("sb_access_token", session.access_token, { ...cookieBase(), httpOnly: true, maxAge: 7 * DAY })
  if (session.refresh_token) {
    res.setCookie("sb_refresh_token", session.refresh_token, { ...cookieBase(), httpOnly: true, maxAge: 30 * DAY })
  }
  issueCsrf(res)
}

export function issueCsrf(res: FastifyReply): string {
  const token = generateCsrfToken()
  res.setCookie("csrf_token", token, { ...cookieBase(), httpOnly: false, maxAge: 30 * DAY })
  return token
}

export function clearSessionCookies(res: FastifyReply) {
  for (const name of ["sb_access_token", "sb_refresh_token", "csrf_token"]) {
    res.clearCookie(name, { path: "/", domain: env.COOKIE_DOMAIN })
  }
}

// ---------- socket tokens ----------
// When the frontend is served from another origin (e.g. Vercel), the websocket goes
// straight to the backend and can't carry the SameSite=Strict session cookie. The page
// fetches a short-lived token through the same-origin API instead and presents it in
// the Socket.IO handshake. It only identifies the user's workspace room.

const SOCKET_TOKEN_TTL_S = 120

function socketTokenKey(): Buffer {
  const base = process.env.SOCKET_TOKEN_SECRET || env.DATA_ENCRYPTION_KEY
  if (!base) throw new Error("socket_token_secret_missing")
  return crypto.createHash("sha256").update(`socket-token:${base}`).digest()
}

export function signSocketToken(ctx: Pick<AuthContext, "userId" | "tenantId">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ sub: ctx.userId, tid: ctx.tenantId, exp: Math.floor(now / 1000) + SOCKET_TOKEN_TTL_S })).toString("base64url")
  const sig = crypto.createHmac("sha256", socketTokenKey()).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifySocketToken(token: string, now = Date.now()): { userId: string; tenantId: string } | null {
  const [payload, sig] = String(token || "").split(".")
  if (!payload || !sig) return null
  const expected = crypto.createHmac("sha256", socketTokenKey()).update(payload).digest()
  const given = Buffer.from(sig, "base64url")
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof data.exp !== "number" || data.exp * 1000 < now || !data.sub || !data.tid) return null
    return { userId: data.sub, tenantId: data.tid }
  } catch {
    return null
  }
}
