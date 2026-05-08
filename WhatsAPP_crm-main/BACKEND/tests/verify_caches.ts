import Redis from "ioredis"

async function main() {
  const url = process.env.REDIS_URL || "redis://localhost:6379"
  const r = new Redis(url)
  const tenant = process.env.TEST_TENANT_ID || "TESTTENANT"
  const waId = process.env.TEST_WA_ID || "15551234567"
  const threadsKey = `inbox:threads:${tenant}`
  const messagesKey = `inbox:messages:${tenant}:${waId}`
  await r.del(threadsKey, messagesKey)
  const now = Date.now()
  await r.zadd(threadsKey, now, waId)
  await r.lpush(messagesKey, JSON.stringify({ id: "msg1", direction: "in", type: "text", payload: { text: { body: "hi" } }, timestamp: now }))
  await r.ltrim(messagesKey, 0, 49)
  const threads = await r.zrevrange(threadsKey, 0, 10)
  const msgsRaw = await r.lrange(messagesKey, 0, 10)
  const msgs = msgsRaw.map(x => JSON.parse(x))
  console.log(JSON.stringify({ threads, messages: msgs }))
  await r.quit()
}

main().catch(e => { console.error(e); process.exit(1) })
