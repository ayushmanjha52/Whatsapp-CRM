import readline from "node:readline"
import { spawn } from "node:child_process"

type CookieMap = Record<string, string>

function parseSetCookie(set: string[]): CookieMap {
  const out: CookieMap = {}
  for (const s of set || []) {
    const kv = s.split(";", 1)[0]
    const [k, v] = kv.split("=")
    out[k.trim()] = v || ""
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
  const base = process.env.GATEWAY_URL || "http://localhost:4000"
  const bearer = process.env.TEST_BEARER_TOKEN || ""
  let cookies: CookieMap = {}

  if (!bearer) {
    const email = process.env.TEST_EMAIL || await prompt("Email: ")
    const password = process.env.TEST_PASSWORD || await prompt("Password: ")
    const login = await req("POST", `${base}/auth/login`, { "Content-Type": "application/json" }, { email, password })
    if (login.status >= 400) throw new Error("login_failed")
    cookies = { ...cookies, ...login.cookies }
  }

  const headers: Record<string, string> = {}
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`

  const oauth = await req("GET", `${base}/api/whatsapp/oauth-url`, headers, undefined, cookies)
  if (oauth.status >= 400) throw new Error("oauth_url_failed")
  const url = oauth.json.url
  console.log("Open:", url)

  try { spawn("powershell", ["Start-Process", url], { stdio: "ignore" }) } catch {}

  const code = await prompt("Paste OAuth code from redirect: ")
  const waba = (process.env.TEST_WABA_ID || "").trim()

  const csrfToken = cookies["csrf_token"] || ""
  const onboardHeaders: Record<string, string> = { "Content-Type": "application/json" }
  if (csrfToken) onboardHeaders["x-csrf-token"] = csrfToken
  if (bearer) onboardHeaders["Authorization"] = `Bearer ${bearer}`

  const body: any = waba ? { code, waba_id: waba } : { code }
  const complete = await req("POST", `${base}/api/whatsapp/complete-onboarding`, onboardHeaders, body, cookies)
  console.log("Result:", complete.status, JSON.stringify(complete.json))
}

main().catch(e => { console.error(e); process.exit(1) })
