/**
 * Socket.IO Test Script
 *
 * Usage: bun run BACKEND/tools/test-socketio.ts
 */

import { io } from "socket.io-client"

const USER_ID = "eb075f56-f7bd-4489-9f6d-1723816cb731"
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6ImNhMkFBODVJTnlMOFQwaEYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hhdWRtcHN5c2h5b2hndmZxZHZtLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY0ODU5NDYzLCJpYXQiOjE3NjQ4NTU4NjMsImVtYWlsIjoia2F1c2hpa2t1bWFyc2luaGExQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJrYXVzaGlra3VtYXJzaW5oYTFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJLYXVzaGlrIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJlYjA3NWY1Ni1mN2JkLTQ0ODktOWY2ZC0xNzIzODE2Y2I3MzEifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc2NDg1NTg2M31dLCJzZXNzaW9uX2lkIjoiODYxOGFiNDUtMmY1Yi00OTBkLWJmYTAtNzc3ZWU0MGUyZWIxIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.R4t5zR6Q2xQH7VAeFnMlPQZNUmzYrsjVO_E17ES5DyE"
const API_URL = "http://localhost:4000"

console.log("=".repeat(60))
console.log("Socket.IO Connection Test")
console.log("=".repeat(60))
console.log("")
console.log("Configuration:")
console.log(`  API URL: ${API_URL}`)
console.log(`  User ID: ${USER_ID}`)
console.log("")

const socket = io(API_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  // For Node.js/Bun client, we pass auth token via extraHeaders
  extraHeaders: {
    "Cookie": `sb_access_token=${ACCESS_TOKEN}`,
    "Authorization": `Bearer ${ACCESS_TOKEN}`
  },
  reconnection: true,
  reconnectionAttempts: 3,
  timeout: 10000
})

socket.on("connect", () => {
  console.log("[Socket.IO] Connected!")
  console.log("[Socket.IO] Socket ID:", socket.id)
  console.log("[Socket.IO] Waiting for events... (Ctrl+C to exit)")
  console.log("")
})

socket.on("disconnect", (reason) => {
  console.log("[Socket.IO] Disconnected:", reason)
})

socket.on("connect_error", (error) => {
  console.log("[Socket.IO] Connection error:", error.message)
})

socket.on("event", (data) => {
  console.log("[Socket.IO] Event received:")
  console.log(JSON.stringify(data, null, 2))
  console.log("")
})

// Keep alive check
setInterval(() => {
  if (socket.connected) {
    console.log("[Socket.IO] Connection alive, socket ID:", socket.id)
  } else {
    console.log("[Socket.IO] Not connected, state:", socket.connected)
  }
}, 10000)

// Handle exit
process.on("SIGINT", () => {
  console.log("\n[Test] Closing connection...")
  socket.disconnect()
  process.exit(0)
})
