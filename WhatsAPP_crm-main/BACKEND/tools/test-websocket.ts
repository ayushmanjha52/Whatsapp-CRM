/**
 * WebSocket Test Script
 *
 * Tests the raw WebSocket connection to the API gateway.
 *
 * Usage:
 *   npx ts-node BACKEND/tools/test-websocket.ts
 *
 * Before running, set the following environment variables or edit the values below:
 *   - USER_ID: Your Supabase user ID (UUID)
 *   - ACCESS_TOKEN: Your Supabase access token (from sb_access_token cookie)
 *   - API_URL: The API gateway URL (default: ws://localhost:4000)
 */

import WebSocket from "ws"

// ============= CONFIGURE THESE VALUES =============
const USER_ID = process.env.USER_ID || "eb075f56-f7bd-4489-9f6d-1723816cb731"  // e.g., "12345678-1234-1234-1234-123456789abc"
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "eyJhbGciOiJIUzI1NiIsImtpZCI6ImNhMkFBODVJTnlMOFQwaEYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hhdWRtcHN5c2h5b2hndmZxZHZtLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY0ODU5NDYzLCJpYXQiOjE3NjQ4NTU4NjMsImVtYWlsIjoia2F1c2hpa2t1bWFyc2luaGExQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJrYXVzaGlra3VtYXJzaW5oYTFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJLYXVzaGlrIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc2NDg1NTg2M31dLCJzZXNzaW9uX2lkIjoiODYxOGFiNDUtMmY1Yi00OTBkLWJmYTAtNzc3ZWU0MGUyZWIxIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.R4t5zR6Q2xQH7VAeFnMlPQZNUmzYrsjVO_E17ES5DyE"  // Get from browser cookies (sb_access_token)
const API_URL = process.env.API_URL || "ws://localhost:4000"
// ==================================================

async function getWsToken(): Promise<string> {
  const httpUrl = API_URL.replace("ws://", "http://").replace("wss://", "https://")
  try {
    const res = await fetch(`${httpUrl}/auth/ws-token`, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Cookie": `sb_access_token=${ACCESS_TOKEN}`
      }
    })
    if (res.ok) {
      const json = await res.json() as { token?: string }
      console.log("[Test] Got WS token from /auth/ws-token")
      return json.token || ""
    } else {
      console.warn("[Test] Failed to get WS token:", res.status, await res.text())
    }
  } catch (err) {
    console.warn("[Test] Error getting WS token:", err)
  }
  return ACCESS_TOKEN // Fallback to using the access token directly
}

async function testWebSocket() {
  console.log("=".repeat(60))
  console.log("WebSocket Connection Test")
  console.log("=".repeat(60))
  console.log("")

  if (USER_ID === "YOUR_USER_ID_HERE" || ACCESS_TOKEN === "YOUR_ACCESS_TOKEN_HERE") {
    console.error("ERROR: Please configure USER_ID and ACCESS_TOKEN before running this test!")
    console.log("")
    console.log("To get these values:")
    console.log("1. Open your browser's DevTools (F12)")
    console.log("2. Go to Application > Cookies")
    console.log("3. Find 'sb_access_token' - this is your ACCESS_TOKEN")
    console.log("4. Go to your /auth/me endpoint or decode the JWT to get your USER_ID")
    console.log("")
    console.log("Then either:")
    console.log("  - Edit this file and replace the placeholder values")
    console.log("  - Or run with env vars: USER_ID=xxx ACCESS_TOKEN=yyy npx ts-node BACKEND/tools/test-websocket.ts")
    process.exit(1)
  }

  console.log("Configuration:")
  console.log(`  API URL: ${API_URL}`)
  console.log(`  User ID: ${USER_ID}`)
  console.log(`  Token: ${ACCESS_TOKEN.slice(0, 20)}...`)
  console.log("")

  // Get WS token
  const wsToken = await getWsToken()

  // Construct WebSocket URL
  const channel = `tenant:${USER_ID}:inbox`
  const wsUrl = new URL(API_URL)
  wsUrl.searchParams.set("channel", channel)
  wsUrl.searchParams.set("token", wsToken)

  console.log(`Connecting to: ${wsUrl.toString()}`)
  console.log(`Channel: ${channel}`)
  console.log("")

  const ws = new WebSocket(wsUrl.toString())

  ws.on("open", () => {
    console.log("[WS] Connected!")
    console.log("[WS] Waiting for messages... (Ctrl+C to exit)")
    console.log("")

    // Send a ping after connection
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("[WS] Sending ping...")
        ws.ping()
      }
    }, 1000)
  })

  ws.on("message", (data) => {
    console.log("[WS] Message received:")
    try {
      const parsed = JSON.parse(data.toString())
      console.log(JSON.stringify(parsed, null, 2))
    } catch {
      console.log(data.toString())
    }
    console.log("")
  })

  ws.on("pong", () => {
    console.log("[WS] Pong received - connection is alive!")
  })

  ws.on("ping", () => {
    console.log("[WS] Ping received from server")
  })

  ws.on("close", (code, reason) => {
    console.log(`[WS] Connection closed: code=${code}, reason=${reason.toString()}`)
    process.exit(0)
  })

  ws.on("error", (err) => {
    console.error("[WS] Error:", err.message)
  })

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("\n[Test] Closing connection...")
    ws.close()
    process.exit(0)
  })
}

// Also test the HTTP endpoints
async function testHttpEndpoints() {
  const httpUrl = API_URL.replace("ws://", "http://").replace("wss://", "https://")

  console.log("")
  console.log("=".repeat(60))
  console.log("HTTP Endpoint Tests")
  console.log("=".repeat(60))
  console.log("")

  // Test /auth/me
  try {
    console.log("[HTTP] Testing /auth/me...")
    const res = await fetch(`${httpUrl}/auth/me`, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Cookie": `sb_access_token=${ACCESS_TOKEN}`
      }
    })
    if (res.ok) {
      const data = await res.json()
      console.log("[HTTP] /auth/me OK:", data)
    } else {
      console.error("[HTTP] /auth/me failed:", res.status, await res.text())
    }
  } catch (err) {
    console.error("[HTTP] /auth/me error:", err)
  }

  // Test /inbox/threads
  try {
    console.log("[HTTP] Testing /inbox/threads...")
    const res = await fetch(`${httpUrl}/inbox/threads`, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Cookie": `sb_access_token=${ACCESS_TOKEN}`
      }
    })
    if (res.ok) {
      const data = await res.json()
      console.log("[HTTP] /inbox/threads OK:", JSON.stringify(data, null, 2).slice(0, 500))
    } else {
      console.error("[HTTP] /inbox/threads failed:", res.status, await res.text())
    }
  } catch (err) {
    console.error("[HTTP] /inbox/threads error:", err)
  }

  console.log("")
}

// Run tests
async function main() {
  await testHttpEndpoints()
  await testWebSocket()

  // Keep process alive - Bun needs this
  await new Promise(() => {})
}

main().catch(console.error)
