/**
 * Simple WebSocket Test using Bun's native WebSocket
 */

const USER_ID = "eb075f56-f7bd-4489-9f6d-1723816cb731"
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6ImNhMkFBODVJTnlMOFQwaEYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hhdWRtcHN5c2h5b2hndmZxZHZtLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY0ODU5NDYzLCJpYXQiOjE3NjQ4NTU4NjMsImVtYWlsIjoia2F1c2hpa2t1bWFyc2luaGExQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJrYXVzaGlra3VtYXJzaW5oYTFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJLYXVzaGlrIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc2NDg1NTg2M31dLCJzZXNzaW9uX2lkIjoiODYxOGFiNDUtMmY1Yi00OTBkLWJmYTAtNzc3ZWU0MGUyZWIxIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.R4t5zR6Q2xQH7VAeFnMlPQZNUmzYrsjVO_E17ES5DyE"
const API_URL = "http://localhost:4000"

async function main() {
  console.log("Getting WS token...")

  // Get WS token
  const tokenRes = await fetch(`${API_URL}/auth/ws-token`, {
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Cookie": `sb_access_token=${ACCESS_TOKEN}`
    }
  })

  if (!tokenRes.ok) {
    console.error("Failed to get token:", await tokenRes.text())
    return
  }

  const { token } = await tokenRes.json() as { token: string }
  console.log("Got WS token")

  // Build WebSocket URL
  const channel = `tenant:${USER_ID}:inbox`
  const wsUrl = `ws://localhost:4000/?channel=${encodeURIComponent(channel)}&token=${encodeURIComponent(token)}`

  console.log("Connecting to:", wsUrl.slice(0, 100) + "...")
  console.log("Channel:", channel)
  console.log("")

  // Use Bun's native WebSocket
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log("[WS] Connected!")
    console.log("[WS] Waiting for messages... (Ctrl+C to exit)")
    console.log("")
  }

  ws.onmessage = (event) => {
    console.log("[WS] Message received:", event.data)
  }

  ws.onclose = (event) => {
    console.log(`[WS] Closed: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`)
  }

  ws.onerror = (event) => {
    console.log("[WS] Error:", event)
  }

  // Keep alive with setInterval
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log("[WS] Connection still open, readyState:", ws.readyState)
    }
  }, 5000)
}

main().catch(console.error)
