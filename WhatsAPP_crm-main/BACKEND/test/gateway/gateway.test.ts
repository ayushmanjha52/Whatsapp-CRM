import { describe, it, expect, beforeAll, mock } from "bun:test"

/**
 * Exercises the real Fastify app (routing, auth, CSRF, roles, validation, tenant scoping)
 * against an in-memory stand-in for Supabase and Redis.
 */

process.env.LOG_LEVEL = "silent"

type Row = Record<string, any>
const tables: Record<string, Row[]> = {
  tenant_members: [
    { id: 1, tenant_id: "T1", user_id: "admin-1", email: "admin@acme.test", role: "admin", status: "active" },
    { id: 2, tenant_id: "T1", user_id: "agent-1", email: "agent@acme.test", role: "agent", status: "active" }
  ],
  contacts: [
    { id: 10, tenant_id: "T1", wa_id: "15550001", display_name: "Jane", in_inbox: true, archived: false, unread_count: 2, tags: ["VIP"], last_inbound_at: new Date().toISOString() },
    { id: 11, tenant_id: "T2", wa_id: "15550002", display_name: "Other tenant", in_inbox: true, archived: false, unread_count: 0, tags: [] }
  ],
  tenants: []
}
const writes: { table: string; op: string; payload: any }[] = []

function builder(table: string) {
  let rows = [...(tables[table] || [])]
  let op = "select"
  let payload: any
  const exec = () => {
    if (op !== "select") writes.push({ table, op, payload })
    if (op === "insert" || op === "upsert") return { data: Array.isArray(payload) ? payload : [payload], error: null, count: 1 }
    return { data: op === "select" ? rows : rows.map(r => ({ ...r, ...(payload || {}) })), error: null, count: rows.length }
  }
  const b: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(exec()).then(res, rej)
      if (prop === "eq") return (c: string, v: any) => { rows = rows.filter(r => r[c] === v); return b }
      if (prop === "gt") return (c: string, v: any) => { rows = rows.filter(r => r[c] > v); return b }
      if (prop === "ilike") return (c: string, v: string) => { rows = rows.filter(r => String(r[c]).toLowerCase() === v.toLowerCase()); return b }
      if (prop === "in") return (c: string, vs: any[]) => { rows = rows.filter(r => vs.includes(r[c])); return b }
      if (prop === "contains") return (c: string, vs: any[]) => { rows = rows.filter(r => vs.every(v => (r[c] || []).includes(v))); return b }
      if (prop === "update" || prop === "insert" || prop === "upsert" || prop === "delete") {
        return (p?: any) => { op = prop; payload = p; return b }
      }
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ ...exec(), data: exec().data[0] ?? null })
      return () => b
    }
  })
  return b
}

const USERS: Record<string, { id: string; email: string }> = {
  "admin-token": { id: "admin-1", email: "admin@acme.test" },
  "agent-token": { id: "agent-1", email: "agent@acme.test" }
}

mock.module("../../src/common/db", () => ({
  supabaseAdmin: () => ({ from: builder, rpc: async () => ({ data: null, error: null }), auth: { admin: {} } }),
  must: (res: any) => { if (res.error) throw new Error(res.error.message); return res.data }
}))
mock.module("../../src/common/supabaseAuth", () => ({
  supabaseAuth: () => ({
    auth: {
      getUser: async (token: string) =>
        USERS[token] ? { data: { user: { ...USERS[token], user_metadata: {} } }, error: null } : { data: { user: null }, error: { message: "bad" } }
    }
  })
}))
const fakeRedis = { publish: async () => 1, incr: async () => 1, expire: async () => 1, ping: async () => "PONG", set: async () => "OK" }
mock.module("../../src/common/queue", () => ({
  redis: () => fakeRedis,
  createRedisConnection: () => ({ psubscribe: () => {}, on: () => {}, quit: async () => {} }),
  queue: () => ({ add: async () => ({ id: "job" }), addBulk: async () => [], getJob: async () => null }),
  worker: () => ({})
}))

let app: any

async function call(method: string, url: string, opts: { token?: string; csrf?: boolean; body?: unknown } = {}) {
  const cookies: string[] = []
  const headers: Record<string, string> = {}
  if (opts.token) cookies.push(`sb_access_token=${opts.token}`)
  if (opts.csrf) {
    cookies.push("csrf_token=abc123")
    headers["x-csrf-token"] = "abc123"
  }
  if (cookies.length) headers.cookie = cookies.join("; ")
  return app.inject({ method, url, headers, payload: opts.body as any })
}

beforeAll(async () => {
  const mod = await import("../../services/api-gateway/index")
  app = await mod.buildApp()
  await app.ready()
})

describe("gateway security", () => {
  it("rejects unauthenticated API calls", async () => {
    const res = await call("GET", "/api/conversations")
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe("missing_token")
  })

  it("rejects invalid tokens", async () => {
    const res = await call("GET", "/api/conversations", { token: "forged" })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe("token_invalid")
  })

  it("requires a CSRF token for state-changing requests", async () => {
    const res = await call("POST", "/api/contacts", { token: "admin-token", body: { name: "X", phone: "+14155552671" } })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe("csrf_invalid")
  })

  it("blocks admin-only actions for agents", async () => {
    const res = await call("DELETE", "/api/conversations/15550001", { token: "agent-token", csrf: true })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe("admin_only")
  })

  it("returns field-level validation errors", async () => {
    const res = await call("POST", "/api/contacts", { token: "admin-token", csrf: true, body: { name: "", phone: "1" } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe("validation_error")
    expect(res.json().details.map((d: any) => d.path)).toContain("name")
  })

  it("rejects numbers that are not in international format", async () => {
    const res = await call("POST", "/api/contacts", { token: "admin-token", csrf: true, body: { name: "Bob", phone: "0987654321" } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe("invalid_phone")
  })

  it("validates login payloads before contacting Supabase", async () => {
    const res = await call("POST", "/api/auth/login", { body: { email: "nope", password: "" } })
    expect(res.statusCode).toBe(400)
  })
})

describe("gateway data access", () => {
  it("scopes conversations to the caller's tenant", async () => {
    const res = await call("GET", "/api/conversations", { token: "agent-token" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.conversations.map((c: any) => c.wa_id)).toEqual(["15550001"])
    expect(body.conversations[0]).toMatchObject({ name: "Jane", unread_count: 2, window_open: true, tags: ["VIP"] })
  })

  it("does not leak another tenant's contact", async () => {
    const res = await call("GET", "/api/contacts/15550002", { token: "admin-token" })
    expect(res.statusCode).toBe(404)
  })

  it("lets agents mark conversations read", async () => {
    writes.length = 0
    const res = await call("POST", "/api/conversations/15550001/read", { token: "agent-token", csrf: true })
    expect(res.statusCode).toBe(200)
    expect(writes).toContainEqual({ table: "contacts", op: "update", payload: { unread_count: 0 } })
  })

  it("reports an unlimited plan when billing is not configured", async () => {
    const res = await call("GET", "/api/billing", { token: "agent-token" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: false, plan: { id: "business" } })
  })

  it("redirects the Meta OAuth callback to the frontend with the code", async () => {
    const res = await call("GET", "/auth/whatsapp/callback?code=ABC&state=XYZ")
    expect(res.statusCode).toBe(302)
    const loc = new URL(res.headers.location)
    expect(loc.pathname).toBe("/settings")
    expect(loc.searchParams.get("code")).toBe("ABC")
    expect(loc.searchParams.get("state")).toBe("XYZ")
  })
})

describe("stripe webhook", () => {
  const secret = "whsec_test_secret"
  const subEvent = (id: string, status: string) =>
    JSON.stringify({
      id,
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          customer: "cus_1",
          status,
          cancel_at_period_end: false,
          metadata: { tenant_id: "T1" },
          items: { data: [{ price: { id: "price_growth" }, current_period_end: 1893456000 }] }
        }
      }
    })

  async function post(body: string, signature?: string) {
    const { default: Stripe } = await import("stripe")
    const header = signature ?? await new Stripe("sk_test_x").webhooks.generateTestHeaderStringAsync({ payload: body, secret })
    return app.inject({ method: "POST", url: "/webhooks/stripe", headers: { "content-type": "application/json", "stripe-signature": header }, payload: body })
  }

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"
    process.env.STRIPE_WEBHOOK_SECRET = secret
    process.env.STRIPE_PRICE_GROWTH = "price_growth"
  })

  it("rejects payloads with a bad signature", async () => {
    const res = await post(subEvent("evt_bad", "active"), "t=1,v1=deadbeef")
    expect(res.statusCode).toBe(400)
  })

  it("puts the tenant on the subscribed plan", async () => {
    writes.length = 0
    const res = await post(subEvent("evt_1", "active"))
    expect(res.statusCode).toBe(200)
    const update = writes.find(w => w.table === "tenants" && w.op === "update")
    expect(update?.payload).toMatchObject({
      plan: "growth",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      subscription_status: "active",
      current_period_end: "2030-01-01T00:00:00.000Z"
    })
  })

  it("drops back to starter when the subscription is canceled", async () => {
    writes.length = 0
    await post(subEvent("evt_2", "canceled"))
    const update = writes.find(w => w.table === "tenants" && w.op === "update")
    expect(update?.payload).toMatchObject({ plan: "starter", subscription_status: "canceled", stripe_subscription_id: null })
  })
})

describe("ai suggestions", () => {
  it("explains when the server has no Anthropic key", async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const res = await call("POST", "/api/conversations/15550001/suggest-replies", { token: "agent-token", csrf: true })
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toBe("ai_not_configured")
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
  })
})
