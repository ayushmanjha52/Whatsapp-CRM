/**
 * End-to-end smoke test against a running gateway (real Supabase + Redis).
 * Exercises auth, contacts, inbox, pipeline, tasks and dashboard, then cleans up.
 *
 *   EMAIL=me@example.com PASSWORD=secret bun run tools/smoke.ts
 */
const base = process.env.API_URL || "http://localhost:4000"
const email = process.env.EMAIL
const password = process.env.PASSWORD
if (!email || !password) throw new Error("Set EMAIL and PASSWORD for an existing, confirmed account")

const jar = new Map<string, string>()
let failures = 0

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (jar.get("csrf_token")) headers["x-csrf-token"] = jar.get("csrf_token")!
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";")
    const i = kv!.indexOf("=")
    jar.set(kv!.slice(0, i), kv!.slice(i + 1))
  }
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` → ${JSON.stringify(detail)}`}`)
  if (!ok) failures++
}

const phone = `+1555${Math.floor(1000000 + Math.random() * 8999999)}`
const login = await call("POST", "/api/auth/login", { email, password })
check("login", login.status === 200, login.json)
const session = await call("GET", "/api/auth/session")
check("session", session.status === 200 && session.json.user?.email === email.toLowerCase(), session.json)

const created = await call("POST", "/api/contacts", { name: "Smoke Test", phone, tags: ["smoke"] })
check("create contact", created.status === 201, created.json)
const waId = created.json?.contact?.wa_id

const conv = await call("GET", "/api/conversations?filter=all")
check("contact appears in inbox", conv.json?.conversations?.some((c: any) => c.wa_id === waId), conv.status)

const send = await call("POST", `/api/conversations/${waId}/messages`, { type: "text", text: "hi" })
check("free-form send blocked outside the 24h window", send.status === 422 && send.json?.error === "window_closed", send.json)

const noCsrf = await fetch(`${base}/api/contacts/${waId}`, { method: "PATCH", headers: { cookie: `sb_access_token=${jar.get("sb_access_token")}`, "Content-Type": "application/json" }, body: "{}" })
check("CSRF enforced", noCsrf.status === 403, noCsrf.status)

const patched = await call("PATCH", `/api/contacts/${waId}`, { notes: "smoke notes", tags: ["smoke", "vip"] })
check("update contact", patched.json?.contact?.tags?.includes("VIP"), patched.json)

const deal = await call("POST", "/api/pipeline/deals", { wa_id: waId, value: 1234 })
check("add to pipeline", deal.status === 201, deal.json)
const board = await call("GET", "/api/pipeline")
const last = board.json?.stages?.at(-1)
const moved = await call("PATCH", `/api/pipeline/deals/${deal.json?.deal?.id}`, { stage_id: last?.id })
check("move deal to last stage sets converted_at", !!moved.json?.deal?.converted_at, moved.json)

const task = await call("POST", "/api/tasks", { title: "Smoke follow-up", due_at: new Date(Date.now() + 3600e3).toISOString(), wa_id: waId })
check("create task", task.status === 201, task.json)

const dash = await call("GET", "/api/dashboard?days=7&tz=UTC")
check("dashboard", dash.status === 200 && Array.isArray(dash.json?.volume), dash.json)

const tpl = await call("GET", "/api/templates")
check("list templates", tpl.status === 200, tpl.json)

if (task.json?.task?.id) await call("DELETE", `/api/tasks/${task.json.task.id}`)
const del = await call("DELETE", `/api/contacts/${waId}`)
check("delete contact (cleanup)", del.status === 200, del.json)

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
