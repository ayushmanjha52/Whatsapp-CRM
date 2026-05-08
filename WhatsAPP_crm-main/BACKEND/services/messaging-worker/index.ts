import { worker, redis } from "../../src/common/queue"
import { Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import { decryptText } from "../../src/security/crypto"

async function resolveTenantCredentials(tenantId: string, preferredPhoneNumberId?: string) {
  const s = supabaseAdmin()
  let phoneNumberId = preferredPhoneNumberId || ""
  let tokenEnc = ""
  if (phoneNumberId) {
    const { data } = await s
      .from("whatsapp_credentials")
      .select("phone_number_id, access_token_encrypted")
      .eq("tenant_id", tenantId)
      .eq("phone_number_id", phoneNumberId)
      .limit(1)
    if (data && data.length > 0) {
      phoneNumberId = (data[0] as any).phone_number_id
      tokenEnc = (data[0] as any).access_token_encrypted || ""
    }
  }
  if (!tokenEnc) {
    const { data } = await s
      .from("whatsapp_credentials")
      .select("phone_number_id, access_token_encrypted")
      .eq("tenant_id", tenantId)
      .limit(1)
    if (data && data.length > 0) {
      phoneNumberId = (data[0] as any).phone_number_id
      tokenEnc = (data[0] as any).access_token_encrypted || ""
    }
  }
  const token = tokenEnc ? decryptText(tokenEnc) : (process.env.WHATSAPP_ACCESS_TOKEN || "")
  phoneNumberId = phoneNumberId || (process.env.WHATSAPP_PHONE_NUMBER_ID || "")
  return { phoneNumberId, token }
}

async function sendViaWhatsApp(jobData: any) {
  const to = jobData.to
  const payload = jobData.payload
  const tenantId = jobData.tenant_id
  const preferredPhone = jobData.phone_number_id
  if (!to || !payload || !tenantId) return
  const { phoneNumberId, token } = await resolveTenantCredentials(tenantId, preferredPhone)
  const resp = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload })
  })
  if (!resp.ok) {
    let bodyText = ""
    try { bodyText = await resp.text() } catch {}
    let bodyJson: any = {}
    try { bodyJson = JSON.parse(bodyText) } catch {}
    try {
      const r = redis()
      const lastKey = `outbound:last:${tenantId}:${to}`
      await r.set(lastKey, JSON.stringify({ ok: false, status: resp.status, body: bodyJson }))
      await r.publish(`tenant:${tenantId}:inbox`, JSON.stringify({ event: "outbound_error", wa_id: to, error: { status: resp.status } }))
    } catch {}
    throw new Error(`send_failed_${resp.status}`)
  }
  const json: any = await resp.json()
  // Persist and publish outbound event
  try {
    const s = supabaseAdmin()
    const r = redis()
    const waId = to
    const msgId = json?.messages?.[0]?.id || undefined
    const ts = Date.now()
    const threadsKey = `inbox:threads:${tenantId}`
    const messagesKey = `inbox:messages:${tenantId}:${waId}`
    const outPayload = { id: msgId, direction: "out", type: payload.type, payload, timestamp: ts, created_at: new Date(ts).toISOString() }
    const pipe = r.pipeline()
    pipe.zadd(threadsKey, ts, waId)
    pipe.lpush(messagesKey, JSON.stringify(outPayload))
    pipe.ltrim(messagesKey, 0, 49)
    if (msgId) {
      await s.from("messages").upsert({
        id: msgId,
        tenant_id: tenantId,
        thread_id: waId,
        direction: "out",
        type: payload.type,
        payload_json: payload,
        status: "sent",
        created_at: new Date(ts).toISOString()
      })
    }
    pipe.publish(`tenant:${tenantId}:inbox`, JSON.stringify({ event: "outbound_message", wa_id: waId, message: outPayload }))
    const lastKey = `outbound:last:${tenantId}:${waId}`
    pipe.set(lastKey, JSON.stringify({ ok: true, status: 200, body: json }))
    await pipe.exec()
    console.log(JSON.stringify({ event: "outbound_sent", tenant_id: tenantId, thread_id: waId, msg_id: msgId }))
  } catch {}
  return json
}

worker(Queues.OutboundMessages, async job => {
  return await sendViaWhatsApp(job.data)
}, { concurrency: Number(process.env.WORKER_CONCURRENCY_OUTBOUND || 20) })
