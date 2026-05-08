/**
 * Test Redis Pub/Sub -> Socket.IO flow
 *
 * Run this WHILE the Socket.IO test client is connected to verify
 * messages are being forwarded correctly.
 *
 * Usage: bun run BACKEND/tools/test-publish.ts
 */

import Redis from "ioredis"

const USER_ID = "eb075f56-f7bd-4489-9f6d-1723816cb731"
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"

async function main() {
  console.log("=".repeat(60))
  console.log("Redis Pub/Sub Test")
  console.log("=".repeat(60))
  console.log("")

  const redis = new Redis(REDIS_URL)
  const channel = `tenant:${USER_ID}:inbox`

  const testEvent = {
    event: "inbound_message",
    wa_id: "919142845885",
    message: {
      id: `test-${Date.now()}`,
      type: "text",
      timestamp: Date.now()
    }
  }

  console.log("Publishing to channel:", channel)
  console.log("Event:", JSON.stringify(testEvent, null, 2))
  console.log("")

  const result = await redis.publish(channel, JSON.stringify(testEvent))
  console.log("Publish result (subscribers reached):", result)

  if (result === 0) {
    console.log("")
    console.log("WARNING: No subscribers received the message!")
    console.log("Make sure:")
    console.log("  1. API Gateway is running")
    console.log("  2. Socket.IO test client is connected")
  } else {
    console.log("")
    console.log("SUCCESS: Message published to", result, "subscriber(s)")
    console.log("Check the Socket.IO test client for the event")
  }

  await redis.quit()
}

main().catch(console.error)
