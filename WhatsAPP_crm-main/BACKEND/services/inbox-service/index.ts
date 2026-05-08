import { supabaseAdmin } from "../../src/common/db"
import { worker, redis, queue } from "../../src/common/queue"
import { Queues } from "../../src/common/config"

function upsertContact(tenantId: string, waId: string, displayName?: string) {
  const s = supabaseAdmin()
  return s
    .from("contacts")
    .upsert({ tenant_id: tenantId, wa_id: waId, origin: "inbox", display_name: displayName }, { onConflict: "tenant_id,wa_id" })
}

async function resolveTenantIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null
  const s = supabaseAdmin()
  const { data } = await s
    .from("whatsapp_credentials")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
  return data && data.length > 0 ? (data[0] as any).tenant_id : null
}

async function persistInbound(body: any) {
  const s = supabaseAdmin()
  const r = redis()
  const entry = (body.entry || [])[0]
  const change = (entry?.changes || [])[0]
  const value = change?.value || {}
  const waId = value.contacts?.[0]?.wa_id
  const name = value.contacts?.[0]?.profile?.name
  const profilePic = value.contacts?.[0]?.profile?.profile_pic
  if (!waId) { console.log(JSON.stringify({ event: "wa_id_missing", phone_number_id: value.metadata?.phone_number_id })); return }
  const phoneNumberId = value.metadata?.phone_number_id || ""
  const tenantId = await resolveTenantIdByPhoneNumberId(phoneNumberId)
  if (!tenantId) {
    console.log(JSON.stringify({ event: "tenant_not_resolved", phone_number_id: phoneNumberId, wa_id: waId }))
    return
  }
  await s.from("tenants").upsert({ id: tenantId, name: tenantId, status: "active" }, { onConflict: "id" })
  await upsertContact(tenantId, waId, name)
  if (profilePic) {
    const memoKey = `profile:seen:${tenantId}:${waId}`
    const last = await r.get(memoKey)
    if (last !== profilePic) {
      const q = queue(Queues.MediaUploads)
      await q.add("profile", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, url: profilePic })
      await r.set(memoKey, profilePic)
      await r.expire(memoKey, 86400)
    }
  } else {
    console.log(JSON.stringify({ event: "no_profile_pic", tenant_id: tenantId, wa_id: waId }))
  }
  for (const m of value.messages || []) {
    const ts = (Number(m.timestamp) || Date.now()) * 1000
    const threadsKey = `inbox:threads:${tenantId}`
    const messagesKey = `inbox:messages:${tenantId}:${waId}`
    const pipe = r.pipeline()
    pipe.zadd(threadsKey, ts, waId)
    pipe.lpush(messagesKey, JSON.stringify({
      id: m.id,
      direction: "in",
      type: m.type,
      payload: m,
      timestamp: ts,
      conversation_id: value.conversation?.id
    }))
    pipe.ltrim(messagesKey, 0, 49)
    pipe.publish(`tenant:${tenantId}:inbox`, JSON.stringify({ event: "inbound_message", wa_id: waId, message: { id: m.id, type: m.type, timestamp: ts } }))
    console.log(JSON.stringify({ event: "inbox_publish", tenant_id: tenantId, thread_id: waId, msg_id: m.id, type: m.type }))
    await pipe.exec()
    await s.from("messages").upsert({
      id: m.id,
      tenant_id: tenantId,
      thread_id: waId,
      direction: "in",
      type: m.type,
      payload_json: m,
      status: "received",
      conversation_id: value.conversation?.id
    })
    try {
      const q = queue(Queues.MediaUploads)
      if (m.image?.id) await q.add("message-media", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, media_id: m.image.id, msg_id: m.id, kind: "image" })
      if (m.video?.id) await q.add("message-media", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, media_id: m.video.id, msg_id: m.id, kind: "video" })
      if (m.audio?.id) await q.add("message-media", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, media_id: m.audio.id, msg_id: m.id, kind: "audio" })
      if (m.document?.id) await q.add("message-media", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, media_id: m.document.id, msg_id: m.id, kind: "document" })
      if (m.sticker?.id) await q.add("message-media", { tenant_id: tenantId, wa_id: waId, phone_number_id: phoneNumberId, media_id: m.sticker.id, msg_id: m.id, kind: "sticker" })
    } catch {}
    console.log(JSON.stringify({ event: "inbound_processed", tenant_id: tenantId, thread_id: waId, msg_id: m.id }))
  }
}

worker(Queues.InboundEvents, async job => {
  await persistInbound(job.data)
}, { concurrency: Number(process.env.WORKER_CONCURRENCY_INBOUND || 10) })
