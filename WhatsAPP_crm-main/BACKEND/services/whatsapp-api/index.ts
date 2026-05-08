import { z } from "zod"
import crypto from "crypto"
import { supabaseAdmin } from "../../src/common/db"
import { supabaseAuth } from "../../src/common/supabaseAuth"
import { verifyAccessToken } from "../../src/auth/jwt"
import { verifyCsrfToken } from "../../src/auth/csrf"
import { encryptText, decryptText } from "../../src/security/crypto"

function makeState(): string { return crypto.randomBytes(16).toString("hex") }

function requireCsrf(req: any) {
  const headerToken = (req.headers["x-csrf-token"] as string) || (req.headers["csrf-token"] as string)
  const ok = verifyCsrfToken(req.cookies?.csrf_token, headerToken)
  if (!ok) throw req.server.httpErrors.forbidden("csrf_invalid")
}

async function requireAuth(req: any) {
  const token = req.cookies?.sb_access_token || (req.headers["authorization"] as string)?.replace("Bearer ", "")
  if (!token) throw req.server.httpErrors.unauthorized("missing_token")
  const auth = supabaseAuth()
  const { data } = await auth.auth.getUser(token)
  if (data?.user) return data.user
  const claims = verifyAccessToken(token)
  return { id: claims.sub as string, email: claims.email as string }
}

function appAccessToken(): string {
  const id = process.env.META_APP_ID || ""
  const secret = process.env.META_APP_SECRET || ""
  const explicit = process.env.META_APP_ACCESS_TOKEN
  return explicit || (id && secret ? `${id}|${secret}` : "")
}

const onboardingSchema = z.object({ code: z.string().min(10), waba_id: z.string().min(5).optional() })

export default async function whatsappApi(app: any) {
  app.get("/oauth-url", async (req: any, res: any) => {
    try { await requireAuth(req) } catch {}
    const state = makeState()
    const appId = process.env.META_APP_ID || ""
    const redirect = process.env.OAUTH_REDIRECT_URI || ""
    const scope = encodeURIComponent("whatsapp_business_management,whatsapp_business_messaging")
    const url = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${scope}&state=${state}`
    const cookieSecure = process.env.COOKIE_SECURE === "1"
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined
    res.setCookie("wa_state", state, { secure: cookieSecure, sameSite: "strict", path: "/", domain: cookieDomain })
    return res.send({ url })
  })

  app.post("/complete-onboarding", async (req: any, res: any) => {
    requireCsrf(req)
    const user = await requireAuth(req)
    const body = onboardingSchema.safeParse(req.body)
    if (!body.success) return res.status(400).send({ error: "validation_error" })
    const code = body.data.code
    let wabaId = body.data.waba_id

    try {
      const shortRes = await fetch(`https://graph.facebook.com/v24.0/oauth/access_token?client_id=${encodeURIComponent(process.env.META_APP_ID || "")}&client_secret=${encodeURIComponent(process.env.META_APP_SECRET || "")}&redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI || "")}&code=${encodeURIComponent(code)}`)
      if (!shortRes.ok) return res.status(400).send({ error: "oauth_exchange_failed" })
      const shortJson: any = await shortRes.json()
      const shortToken: string = shortJson.access_token

      const longRes = await fetch(`https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(process.env.META_APP_ID || "")}&client_secret=${encodeURIComponent(process.env.META_APP_SECRET || "")}&fb_exchange_token=${encodeURIComponent(shortToken)}`)
      if (!longRes.ok) return res.status(400).send({ error: "long_lived_exchange_failed" })
      const longJson: any = await longRes.json()
      const longToken: string = longJson.access_token
      const expiresIn: number = longJson.expires_in ?? 5184000

      const debugRes = await fetch(`https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(longToken)}`, { headers: { Authorization: `Bearer ${appAccessToken()}` } })
      if (!debugRes.ok) return res.status(400).send({ error: "debug_token_failed" })
      const debugJson: any = await debugRes.json()
      const scopes: string[] = debugJson?.data?.scopes || []
      const dataAccessExp: number | undefined = debugJson?.data?.data_access_expires_at
      const required = ["whatsapp_business_management", "whatsapp_business_messaging"]
      const okScopes = required.every(s => scopes.includes(s))
      if (!okScopes) return res.status(400).send({ error: "missing_scopes", scopes })

      if (!wabaId) {
        const bizRes = await fetch(`https://graph.facebook.com/v24.0/me/businesses`, { headers: { Authorization: `Bearer ${longToken}` } })
        if (!bizRes.ok) return res.status(400).send({ error: "business_list_failed" })
        const bizJson: any = await bizRes.json()
        const businesses: any[] = bizJson.data || []
        for (const b of businesses) {
          const wabasRes = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(b.id)}/owned_whatsapp_business_accounts`, { headers: { Authorization: `Bearer ${longToken}` } })
          const wabasJson: any = await wabasRes.json().catch(() => ({}))
          const wabas: any[] = wabasJson.data || []
          if (wabas.length > 0) { wabaId = wabas[0].id; break }
        }
        if (!wabaId) return res.status(400).send({ error: "waba_not_found" })
      }

      const phonesRes = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(wabaId)}/phone_numbers`, { headers: { Authorization: `Bearer ${longToken}` } })
      if (!phonesRes.ok) return res.status(400).send({ error: "phone_numbers_fetch_failed" })
      const phonesJson: any = await phonesRes.json()
      const phones: any[] = phonesJson.data || []

      const s = supabaseAdmin()

      // Check if any of these phone numbers are already connected to another tenant
      const phoneIds = phones.map((p: any) => p.id)
      const { data: existingCreds } = await s
        .from("whatsapp_credentials")
        .select("phone_number_id, tenant_id, display_phone_number")
        .in("phone_number_id", phoneIds)

      const alreadyConnected = (existingCreds || []).filter((c: any) => c.tenant_id !== user.id)
      if (alreadyConnected.length > 0) {
        return res.status(409).send({
          error: "phone_already_connected",
          message: "This WhatsApp Business Account is already connected to another user",
          phone_numbers: alreadyConnected.map((c: any) => c.display_phone_number || c.phone_number_id)
        })
      }

      const tokenEnc = encryptText(longToken)
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
      const lastScopeCheckAt = new Date().toISOString()
      const defaultSenderExists = await s.from("whatsapp_credentials").select("phone_number_id").eq("tenant_id", user.id).eq("default_sender", true).limit(1)
      await s.from("tenants").upsert({ id: user.id, name: (user as any).email || user.id, status: "active" }, { onConflict: "id" })
      for (let i = 0; i < phones.length; i++) {
        const p = phones[i]
        const { error } = await s.from("whatsapp_credentials").upsert({
          tenant_id: user.id,
          waba_id: wabaId,
          phone_number_id: p.id,
          access_token_encrypted: tokenEnc,
          token_expires_at: tokenExpiresAt,
          scopes,
          last_scope_check_at: lastScopeCheckAt,
          data_access_expires_at: dataAccessExp ? new Date(dataAccessExp * 1000).toISOString() : null,
          display_phone_number: p.display_phone_number,
          verified_name: p.verified_name,
          status: p.status,
          quality_rating: p.quality_rating,
          account_mode: p.account_mode,
          default_sender: (defaultSenderExists.data && defaultSenderExists.data.length > 0) ? false : i === 0
        }, { onConflict: "tenant_id,phone_number_id" })
        if (error) return res.status(500).send({ error: "store_failed" })
      }

      return res.send({ success: true, waba_id: wabaId, phone_numbers_count: phones.length })
    } catch {
      return res.status(500).send({ error: "onboarding_failed" })
    }
  })

  app.get("/credentials", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data, error } = await s.from("whatsapp_credentials").select("tenant_id,waba_id,phone_number_id,display_phone_number,verified_name,status,quality_rating,account_mode,token_expires_at,scopes,last_scope_check_at,data_access_expires_at,default_sender").eq("tenant_id", user.id)
    if (error) return res.status(500).send({ error: "list_failed" })
    return res.send({ credentials: data || [] })
  })

  app.get("/numbers", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data, error } = await s.from("whatsapp_credentials").select("phone_number_id,display_phone_number,verified_name,status,quality_rating,account_mode,default_sender").eq("tenant_id", user.id)
    if (error) return res.status(500).send({ error: "list_failed" })
    return res.send({ numbers: data || [] })
  })

  app.get("/templates", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data, error } = await s.from("templates").select("id,waba_id,name,language,category,status").eq("tenant_id", user.id)
    if (error) return res.status(500).send({ error: "list_failed" })
    return res.send({ templates: data || [] })
  })

  app.get("/verification", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data } = await s.from("whatsapp_credentials").select("waba_id,access_token_encrypted").eq("tenant_id", user.id).limit(1)
    const row = data && data[0]
    if (!row) return res.status(404).send({ error: "not_onboarded" })
    const token = row.access_token_encrypted ? decryptText(row.access_token_encrypted) : ""
    let verification: any = {}
    try {
      const longTokenRes = await fetch(`https://graph.facebook.com/v24.0/me/businesses`, { headers: { Authorization: `Bearer ${token}` } })
      const bizJson: any = await longTokenRes.json().catch(() => ({}))
      const businesses: any[] = bizJson.data || []
      if (businesses.length > 0) {
        const bId = businesses[0].id
        const bRes = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(bId)}?fields=name,verification_status`, { headers: { Authorization: `Bearer ${token}` } })
        verification = await bRes.json().catch(() => ({}))
      }
    } catch {}
    return res.send({ verification })
  })

  app.get("/analytics/messages", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data } = await s.from("events").select("type,data_json,created_at").eq("tenant_id", user.id).limit(1000)
    const counts: Record<string, number> = {}
    for (const e of data || []) counts[e.type] = (counts[e.type] || 0) + 1
    return res.send({ counts })
  })

  app.get("/analytics/pricing", async (req: any, res: any) => {
    const user = await requireAuth(req)
    return res.send({ pricing: [] })
  })

  app.get("/analytics/templates", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data } = await s.from("templates").select("name,status,category").eq("tenant_id", user.id)
    const counts: Record<string, number> = {}
    for (const t of data || []) counts[t.status || "unknown"] = (counts[t.status || "unknown"] || 0) + 1
    return res.send({ status_counts: counts, templates: data || [] })
  })

  app.get("/webhook/status", async (req: any, res: any) => {
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    const { data } = await s.from("whatsapp_webhook_settings").select("verify_token,callback_url,subscribed_at,last_signature_valid_at").eq("tenant_id", user.id).limit(1)
    return res.send({ status: data && data[0] ? data[0] : {} })
  })

  app.post("/webhook/config", async (req: any, res: any) => {
    requireCsrf(req)
    const user = await requireAuth(req)
    const body = (req.body || {}) as any
    const s = supabaseAdmin()
    const { error } = await s.from("whatsapp_webhook_settings").upsert({ tenant_id: user.id, verify_token: body.verify_token, callback_url: body.callback_url, subscribed_at: new Date().toISOString() }, { onConflict: "tenant_id" })
    if (error) return res.status(500).send({ error: "save_failed" })
    return res.send({ success: true })
  })

  app.post("/disconnect", async (req: any, res: any) => {
    requireCsrf(req)
    const user = await requireAuth(req)
    const s = supabaseAdmin()
    await s.from("whatsapp_credentials").delete().eq("tenant_id", user.id)
    await s.from("whatsapp_webhook_settings").delete().eq("tenant_id", user.id)
    return res.send({ success: true })
  })
}
