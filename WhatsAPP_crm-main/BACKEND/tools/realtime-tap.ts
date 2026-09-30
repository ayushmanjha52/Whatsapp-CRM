/**
 * Logs in and prints every realtime event your workspace receives.
 *
 *   EMAIL=me@example.com PASSWORD=secret bun run tools/realtime-tap.ts
 */
import { io } from "socket.io-client"

const base = process.env.API_URL || "http://localhost:4000"
const email = process.env.EMAIL
const password = process.env.PASSWORD
if (!email || !password) throw new Error("Set EMAIL and PASSWORD")

const res = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
})
if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
const cookie = res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")
const session: any = await res.json()
console.log(`logged in as ${session.user.email} (workspace ${session.user.tenant_id}, ${session.user.role})`)

const socket = io(base, { path: "/socket.io/", transports: ["websocket"], extraHeaders: { cookie } })
socket.on("connect", () => console.log("connected — waiting for events (Ctrl+C to stop)"))
socket.on("connect_error", e => console.error("connect error:", e.message))
socket.on("event", e => console.log(new Date().toISOString(), JSON.stringify(e)))
