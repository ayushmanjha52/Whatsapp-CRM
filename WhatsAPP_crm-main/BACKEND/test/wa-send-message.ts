import readline from "node:readline"

const BASE = process.env.TEST_BASE_URL || "http://localhost:4000"

type CookieMap = Record<string, string>

function parseSetCookie(set: string[]): CookieMap {
  const out: CookieMap = {}
  for (const s of set || []) {
    const kv = s.split(";", 1)[0]
    const [k, v] = kv.split("=")
    out[k.trim()] = v
  }
  return out
}

function cookieHeader(cookies: CookieMap): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")
}

async function req(method: string, url: string, headers: Record<string, string>, body?: any, cookies?: CookieMap) {
  const h = { ...headers }
  if (cookies && Object.keys(cookies).length > 0) h["Cookie"] = cookieHeader(cookies)
  const r: any = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  const getSetCookie = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : undefined
  const set = r.headers.get("set-cookie")
  const multi = getSetCookie ?? (set ? [set] : [])
  const text = await r.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, cookies: parseSetCookie(multi as string[]) }
}

async function prompt(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans) }))
}

async function main() {
  const email = process.env.TEST_EMAIL || await prompt("Email: ")
  const password = process.env.TEST_PASSWORD || await prompt("Password: ")
  let to = (process.env.TEST_TO || await prompt("Recipient (+E164): ")).trim()
  if (!to) { console.error("Recipient number is required (+E164). Example: +15551234567"); process.exit(2) }
  const message = (process.env.TEST_MESSAGE || await prompt("Message: ")).trim() || "Hello from test"
  let cookies: CookieMap = {}

  const login = await req("POST", `${BASE}/auth/login`, { "Content-Type": "application/json" }, { email, password })
  if (login.status >= 400) { console.error("Login failed", JSON.stringify(login.json)); process.exit(1) }
  cookies = { ...cookies, ...login.cookies }

  let selectedPhone = (process.env.TEST_PHONE_NUMBER_ID || "").trim()
  if (!selectedPhone) {
    const numbers = await req("GET", `${BASE}/api/whatsapp/numbers`, {}, undefined, cookies)
    const nums: any[] = numbers.json.numbers || []
    if (nums.length === 0) { console.error("No WhatsApp numbers found for this tenant"); process.exit(1) }
    const def = nums.find(n => n.default_sender) || nums[0]
    console.log(`Using sender: ${def.display_phone_number || def.phone_number_id}`)
    selectedPhone = def?.phone_number_id || ""
  }

  const useTemplate = (process.env.TEST_USE_TEMPLATE || "").toLowerCase() === "y"
  const templateName = (process.env.TEST_TEMPLATE_NAME || "").trim()
  const templateLang = (process.env.TEST_TEMPLATE_LANG || "en_US").trim()
  const payload = useTemplate && templateName
    ? { type: "template", template: { name: templateName, language: { code: templateLang } } }
    : { type: "text", text: { body: message, preview_url: false } }
  const send = await req("POST", `${BASE}/messages/send`, { "Content-Type": "application/json" }, { to, payload, phone_number_id: selectedPhone }, cookies)
  console.log(JSON.stringify({ status: send.status, response: send.json }))
}

main().catch(e => { console.error(e); process.exit(1) })
