import WebSocket from "ws"

import * as readline from "readline"

let USER_ID = process.argv[2] || ""
let TOKEN = process.argv[3] || ""

async function getInput() {
  if (USER_ID && TOKEN) return
  
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  })
  
  const ask = (q: string) => new Promise<string>(resolve => 
    rl.question(q, ans => resolve(ans.trim()))
  )
  
  if (!USER_ID) USER_ID = await ask("Enter USER_ID: ")
  if (!TOKEN) TOKEN = await ask("Enter ACCESS_TOKEN: ")
  
  rl.close()
}

await getInput()

if (!USER_ID || !TOKEN) {
  console.error("❌ Missing USER_ID or TOKEN")
  process.exit(1)
}

const url = `ws://localhost:4000/?channel=tenant:${USER_ID}:inbox&token=${TOKEN}`

console.log("🔍 Diagnostic WebSocket Test")
console.log("=".repeat(50))
console.log("USER_ID:", USER_ID)
console.log("TOKEN (first 50 chars):", TOKEN.substring(0, 50) + "...")
console.log("TOKEN length:", TOKEN.length)
console.log("URL:", url.replace(TOKEN, "***TOKEN***"))
console.log("=".repeat(50))

const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${TOKEN}`
  }
})

let connectionTime: number
let firstEventTime: number
let isClosed = false

ws.on("open", () => {
  connectionTime = Date.now()
  console.log("✅ WebSocket OPEN event fired")
  console.log("   ReadyState:", ws.readyState, "(1 = OPEN)")
  console.log("   Buffered Amount:", ws.bufferedAmount)
  console.log("   Extensions:", ws.extensions)
  console.log("   Protocol:", ws.protocol)
  
  // Try to send a message
  setTimeout(() => {
    if (isClosed) return
    console.log("\n📤 Sending test message...")
    try {
      ws.send(JSON.stringify({ test: "hello", timestamp: Date.now() }))
      console.log("   Message sent successfully")
    } catch (err) {
      console.log("   ❌ Failed to send:", (err as any).message)
    }
  }, 100)
})

ws.on("message", (data) => {
  if (!firstEventTime) firstEventTime = Date.now()
  console.log("\n📨 Message received:")
  console.log("   Time since open:", Date.now() - connectionTime, "ms")
  console.log("   Data:", data.toString())
})

ws.on("ping", () => {
  console.log("\n🏓 PING received from server")
})

ws.on("pong", () => {
  console.log("\n🏓 PONG received from server")
})

ws.on("error", (err) => {
  console.log("\n❌ ERROR event:")
  console.log("   Message:", (err as any).message)
  console.log("   Code:", (err as any).code)
  console.log("   Full error:", err)
})

ws.on("close", (code, reason) => {
  isClosed = true
  clearInterval(pingInterval)
  const duration = connectionTime ? Date.now() - connectionTime : 0
  console.log("\n🔴 WebSocket CLOSED")
  console.log("   Code:", code)
  console.log("   Reason:", reason.toString() || "(empty)")
  console.log("   Duration:", duration, "ms")
  console.log("   Received messages:", firstEventTime ? "YES" : "NO")
  console.log("   Total pings sent:", pingCount)
  
  console.log("\n📋 Close code meanings:")
  const codes: Record<number, string> = {
    1000: "Normal closure",
    1001: "Going away",
    1002: "Protocol error",
    1003: "Unsupported data",
    1006: "Abnormal closure (no close frame received)",
    1007: "Invalid frame payload",
    1008: "Policy violation",
    1009: "Message too big",
    1011: "Server error",
    1015: "TLS handshake failure"
  }
  console.log("   Your code:", codes[code] || "Unknown")
  
  if (code === 1006) {
    console.log("\n⚠️  Code 1006 means:")
    console.log("   - Server closed connection without sending close frame")
    console.log("   - Network issue")
    console.log("   - Server crashed/rejected connection")
    console.log("   - Idle timeout (no activity)")
  }
  
  if (code === 1000) {
    console.log("\n✅ Normal closure - test completed successfully!")
  }
  
  process.exit(code === 1000 ? 0 : 1)
})

// Send periodic pings to keep connection alive
let pingCount = 0
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    pingCount++
    console.log(`\n🏓 Sending ping #${pingCount}...`)
    ws.ping()
  }
}, 5000)

// Keep alive for 30 seconds
setTimeout(() => {
  clearInterval(pingInterval)
  console.log("\n⏱️  30 second timeout reached")
  if (ws.readyState === WebSocket.OPEN) {
    console.log("   ✅ Connection still open after 30 seconds!")
    console.log("   Closing gracefully...")
    ws.close(1000, "Test complete")
  } else {
    console.log("   ❌ Connection already closed")
    process.exit(1)
  }
}, 30000)

console.log("\n⏳ Connecting...\n")