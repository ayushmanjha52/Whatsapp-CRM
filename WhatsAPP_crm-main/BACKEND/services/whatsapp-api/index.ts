import type { FastifyInstance, FastifyRequest } from "fastify"
import crypto from "crypto"
import { z } from "zod"
import { supabaseAdmin, must } from "../../src/common/db"
import { env } from "../../src/common/config"
import { encryptText } from "../../src/security/crypto"
import { requireAdmin } from "../../src/http/auth"
import { badRequest, conflict, parse } from "../../src/http/errors"
import { GRAPH_BASE, GraphError, getPhoneNumber, graph, listPhoneNumbers, subscribeApp } from "../../src/whatsapp/graph"
import { syncTemplates } from "../api-gateway/routes/templates"

const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"]

function appAccessToken(): string {
  return process.env.META_APP_ACCESS_TOKEN || (env.META_APP_ID && env.META_APP_SECRET ? `${env.META_APP_ID}|${env.META_APP_SECRET}` : "")
}

function graphFailure(e: unknown, code: string): never {
  if (e instanceof GraphError) throw badRequest(code, e.details || e.message, e.toJSON())
  throw e
}

/**
 * Stores credentials for every phone number of a WABA, refusing numbers that another
 * workspace already connected, then subscribes our app to the WABA's webhooks.
 */
async function storeCredentials(req: FastifyRequest, opts: {
  wabaId: string
  token: string
  phones: any[]
  scopes?: string[]
  tokenExpiresAt?: string | null
  dataAccessExpiresAt?: string | null
}) {
  const tenantId = req.auth.tenantId
  const s = supabaseAdmin()
  if (opts.phones.length === 0) throw badRequest("no_phone_numbers", "This WhatsApp Business Account has no phone numbers")

  const { data: taken } = await s
    .from("whatsapp_credentials")
    .select("phone_number_id,tenant_id,display_phone_number")
    .in("phone_number_id", opts.phones.map(p => p.id))
  const elsewhere = (taken || []).filter((c: any) => c.tenant_id !== tenantId)
  if (elsewhere.length > 0) {
    throw conflict("phone_already_connected", "This WhatsApp number is already connected to another workspace", {
      phone_numbers: elsewhere.map((c: any) => c.display_phone_number || c.phone_number_id)
    })
  }

  await s.from("tenants").upsert({ id: tenantId, name: req.auth.email || tenantId, status: "active" }, { onConflict: "id", ignoreDuplicates: true })
  const { data: defaults } = await s.from("whatsapp_credentials").select("phone_number_id").eq("tenant_id", tenantId).eq("default_sender", true).limit(1)
  const hasDefault = (defaults || []).length > 0
  const tokenEnc = encryptText(opts.token)
  const now = new Date().toISOString()
  for (let i = 0; i < opts.phones.length; i++) {
    const p = opts.phones[i]
    must(
      await s.from("whatsapp_credentials").upsert({
        tenant_id: tenantId,
        waba_id: opts.wabaId,
        phone_number_id: p.id,
        access_token_encrypted: tokenEnc,
        token_expires_at: opts.tokenExpiresAt ?? null,
        scopes: opts.scopes ?? null,
        last_scope_check_at: now,
        data_access_expires_at: opts.dataAccessExpiresAt ?? null,
        display_phone_number: p.display_phone_number,
        verified_name: p.verified_name,
        status: p.status,
        quality_rating: p.quality_rating,
        account_mode: p.account_mode,
        default_sender: hasDefault ? undefined : i === 0
      }, { onConflict: "tenant_id,phone_number_id" }),
      "store_credentials"
    )
  }

  let subscribed = true
  try {
    await subscribeApp(opts.wabaId, opts.token)
  } catch (e: any) {
    subscribed = false
    req.log.warn({ err: e?.message, waba_id: opts.wabaId }, "waba_subscribe_failed")
  }
  let templates = 0
  try {
    templates = await syncTemplates(tenantId)
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "template_sync_failed")
  }
  return { waba_id: opts.wabaId, phone_numbers: opts.phones.length, webhooks_subscribed: subscribed, templates_synced: templates }
}

export default async function whatsappApi(app: FastifyInstance) {
  app.get("/status", async req => {
    const s = supabaseAdmin()
    const rows = must(
      await s.from("whatsapp_credentials")
        .select("waba_id,phone_number_id,display_phone_number,verified_name,status,quality_rating,account_mode,default_sender,token_expires_at")
        .eq("tenant_id", req.auth.tenantId),
      "list_numbers"
    ) as any[]
    const isAdmin = req.auth.role === "admin"
    return {
      connected: rows.length > 0,
      waba_id: rows[0]?.waba_id ?? null,
      numbers: rows,
      webhook: {
        callback_url: env.PUBLIC_WEBHOOK_URL || null,
        verify_token: isAdmin ? env.WHATSAPP_VERIFY_TOKEN || null : null
      },
      oauth_available: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.OAUTH_REDIRECT_URI)
    }
  })

  app.get("/oauth-url", async (req, res) => {
    requireAdmin(req)
    if (!env.META_APP_ID || !env.OAUTH_REDIRECT_URI) throw badRequest("oauth_not_configured", "META_APP_ID and OAUTH_REDIRECT_URI must be set")
    const state = crypto.randomBytes(16).toString("hex")
    const url = new URL(`https://www.facebook.com/${env.GRAPH_API_VERSION}/dialog/oauth`)
    url.searchParams.set("client_id", env.META_APP_ID)
    url.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URI)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", [...REQUIRED_SCOPES, "business_management"].join(","))
    url.searchParams.set("state", state)
    if (process.env.META_CONFIG_ID) url.searchParams.set("config_id", process.env.META_CONFIG_ID)
    res.setCookie("wa_state", state, { secure: env.COOKIE_SECURE, sameSite: "lax", path: "/", httpOnly: true, maxAge: 900, domain: env.COOKIE_DOMAIN })
    return { url: url.toString() }
  })

  app.post("/complete-onboarding", async (req, res) => {
    requireAdmin(req)
    const body = parse(z.object({ code: z.string().min(10), state: z.string().optional(), waba_id: z.string().min(5).optional() }), req.body)
    const expectedState = (req.cookies as any)?.wa_state
    if (expectedState && body.state && expectedState !== body.state) throw badRequest("state_mismatch", "The connection request expired, please try again")
    res.clearCookie("wa_state", { path: "/", domain: env.COOKIE_DOMAIN })

    const redirect = env.OAUTH_REDIRECT_URI
    let longToken: string
    let expiresIn: number
    let scopes: string[] = []
    let dataAccessExp: number | undefined
    try {
      const short = await graph<any>(`${GRAPH_BASE}/oauth/access_token`, {
        token: "",
        query: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirect, code: body.code }
      })
      const long = await graph<any>(`${GRAPH_BASE}/oauth/access_token`, {
        token: "",
        query: { grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token }
      })
      longToken = long.access_token
      expiresIn = long.expires_in ?? 60 * 24 * 3600
      const debug = await graph<any>("debug_token", { token: appAccessToken(), query: { input_token: longToken } })
      scopes = debug?.data?.scopes || []
      dataAccessExp = debug?.data?.data_access_expires_at
    } catch (e) {
      graphFailure(e, "oauth_exchange_failed")
    }
    const missing = REQUIRED_SCOPES.filter(sc => !scopes.includes(sc))
    if (missing.length > 0) throw badRequest("missing_scopes", `Grant these permissions and try again: ${missing.join(", ")}`)

    let wabaId = body.waba_id
    try {
      if (!wabaId) {
        const biz = await graph<any>("me/businesses", { token: longToken })
        for (const b of biz.data || []) {
          const wabas = await graph<any>(`${b.id}/owned_whatsapp_business_accounts`, { token: longToken }).catch(() => ({ data: [] }))
          if (wabas.data?.length) { wabaId = wabas.data[0].id; break }
        }
      }
      if (!wabaId) throw badRequest("waba_not_found", "No WhatsApp Business Account was shared with this app")
      const phones = await listPhoneNumbers(wabaId, longToken)
      return await storeCredentials(req, {
        wabaId,
        token: longToken,
        phones: phones.data || [],
        scopes,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        dataAccessExpiresAt: dataAccessExp ? new Date(dataAccessExp * 1000).toISOString() : null
      })
    } catch (e) {
      graphFailure(e, "onboarding_failed")
    }
  })

  /** For System User permanent tokens (the usual setup without Embedded Signup). */
  app.post("/connect-manual", async req => {
    requireAdmin(req)
    const body = parse(z.object({
      waba_id: z.string().trim().regex(/^\d+$/, "Digits only"),
      phone_number_id: z.string().trim().regex(/^\d+$/, "Digits only"),
      access_token: z.string().trim().min(20)
    }), req.body)
    let phone: any
    try {
      phone = await getPhoneNumber(body.phone_number_id, body.access_token)
      const all = await listPhoneNumbers(body.waba_id, body.access_token)
      if (!(all.data || []).some((p: any) => p.id === body.phone_number_id)) {
        throw badRequest("phone_not_in_waba", "That phone number ID does not belong to this WhatsApp Business Account")
      }
    } catch (e) {
      graphFailure(e, "credentials_invalid")
    }
    return storeCredentials(req, { wabaId: body.waba_id, token: body.access_token, phones: [phone] })
  })

  app.post("/default-sender", async req => {
    requireAdmin(req)
    const body = parse(z.object({ phone_number_id: z.string().min(1) }), req.body)
    const s = supabaseAdmin()
    const { data: owned } = await s.from("whatsapp_credentials").select("phone_number_id").eq("tenant_id", req.auth.tenantId).eq("phone_number_id", body.phone_number_id).maybeSingle()
    if (!owned) throw badRequest("sender_not_owned")
    must(await s.from("whatsapp_credentials").update({ default_sender: false }).eq("tenant_id", req.auth.tenantId).eq("default_sender", true), "clear_default")
    must(await s.from("whatsapp_credentials").update({ default_sender: true }).eq("tenant_id", req.auth.tenantId).eq("phone_number_id", body.phone_number_id), "set_default")
    return { success: true }
  })

  app.post("/disconnect", async req => {
    requireAdmin(req)
    const s = supabaseAdmin()
    must(await s.from("whatsapp_credentials").delete().eq("tenant_id", req.auth.tenantId), "disconnect")
    await s.from("whatsapp_webhook_settings").delete().eq("tenant_id", req.auth.tenantId)
    return { success: true }
  })
}
