import { supabaseAdmin } from "../../src/common/db"
import { worker, queue } from "../../src/common/queue"
import { assertEnv, Queues } from "../../src/common/config"
import { publish } from "../../src/common/realtime"
import { normalizeWebhook, mediaOf, type InboundMessageEvent, type StatusEvent, type TemplateStatusEvent } from "../../src/whatsapp/normalize"
import { previewOf, toMessageDTO } from "../../src/whatsapp/messages"
import { resolveTenantByPhoneNumberId, resolveTenantByWabaId } from "../../src/whatsapp/credentials"

const tenantCache = new Map<string, { tenantId: string | null; exp: number }>()

async function tenantFor(key: string, lookup: () => Promise<string | null>): Promise<string | null> {
  const hit = tenantCache.get(key)
  if (hit && hit.exp > Date.now()) return hit.tenantId
  const tenantId = await lookup()
  tenantCache.set(key, { tenantId, exp: Date.now() + (tenantId ? 60_000 : 10_000) })
  return tenantId
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }))
}

async function handleMessage(ev: InboundMessageEvent) {
  const tenantId = await tenantFor(`pn:${ev.phoneNumberId}`, () => resolveTenantByPhoneNumberId(ev.phoneNumberId))
  if (!tenantId) return log("tenant_not_resolved", { phone_number_id: ev.phoneNumberId, wa_id: ev.waId })
  const m = ev.message
  const type = String(m.type || "unknown")
  const s = supabaseAdmin()
  const { data, error } = await s.rpc("crm_ingest_inbound_message", {
    p_tenant: tenantId,
    p_wa_id: ev.waId,
    p_profile_name: ev.profileName || null,
    p_message_id: m.id,
    p_type: type,
    p_payload: m,
    p_preview: previewOf(type, m),
    p_at: new Date(ev.timestampMs).toISOString(),
    p_conversation_id: ev.conversationId || null
  })
  if (error) throw new Error(`ingest_failed: ${error.message}`)
  const result = data as { inserted: boolean; campaign_id: number | null }
  if (!result?.inserted) return log("inbound_duplicate", { tenant_id: tenantId, msg_id: m.id })

  const media = mediaOf(m)
  if (media) {
    await queue(Queues.MediaUploads).add("message-media", {
      tenant_id: tenantId, wa_id: ev.waId, phone_number_id: ev.phoneNumberId, media_id: media.id, msg_id: m.id, kind: media.kind
    })
  }

  const { data: row } = await s.from("messages").select("*").eq("tenant_id", tenantId).eq("id", m.id).single()
  if (row) await publish(tenantId, "message.created", { wa_id: ev.waId, message: toMessageDTO(row) })
  await publish(tenantId, "conversation.updated", { wa_id: ev.waId, inbound: true })
  if (result.campaign_id) await publish(tenantId, "campaign.updated", { campaign_id: result.campaign_id })
  log("inbound_processed", { tenant_id: tenantId, wa_id: ev.waId, msg_id: m.id, type })
}

async function handleStatus(ev: StatusEvent) {
  const tenantId = await tenantFor(`pn:${ev.phoneNumberId}`, () => resolveTenantByPhoneNumberId(ev.phoneNumberId))
  if (!tenantId) return
  const { data, error } = await supabaseAdmin().rpc("crm_apply_message_status", {
    p_tenant: tenantId,
    p_wamid: ev.wamid,
    p_status: ev.status,
    p_at: new Date(ev.timestampMs).toISOString(),
    p_error: ev.error || null
  })
  if (error) throw new Error(`status_failed: ${error.message}`)
  const r = data as { found: boolean; message_id?: string; wa_id?: string; status?: string; campaign_id?: number | null }
  if (!r?.found) return
  await publish(tenantId, "message.updated", {
    wa_id: r.wa_id,
    message: { id: r.message_id, status: r.status, error: ev.status === "failed" ? ev.error : undefined }
  })
  if (r.campaign_id) await publish(tenantId, "campaign.updated", { campaign_id: r.campaign_id })
}

async function handleTemplateStatus(ev: TemplateStatusEvent) {
  const tenantId = await tenantFor(`waba:${ev.wabaId}`, () => resolveTenantByWabaId(ev.wabaId))
  if (!tenantId) return
  let q = supabaseAdmin()
    .from("templates")
    .update({ status: ev.event.toUpperCase(), rejected_reason: ev.reason || null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
  q = ev.templateId ? q.eq("meta_id", ev.templateId) : q.eq("name", ev.name || "").eq("language", ev.language || "")
  const { error } = await q
  if (error) throw new Error(`template_status_failed: ${error.message}`)
  await publish(tenantId, "template.updated", { name: ev.name, status: ev.event })
  log("template_status", { tenant_id: tenantId, name: ev.name, status: ev.event })
}

export async function processWebhook(body: any) {
  for (const ev of normalizeWebhook(body)) {
    if (ev.kind === "message") await handleMessage(ev)
    else if (ev.kind === "status") await handleStatus(ev)
    else await handleTemplateStatus(ev)
  }
}

if (import.meta.main) {
  assertEnv("inbox-service", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"])
  // Every handler is idempotent, so a retried job cannot double-count a message.
  worker(Queues.InboundEvents, async job => processWebhook(job.data), {
    concurrency: Number(process.env.WORKER_CONCURRENCY_INBOUND || 10)
  })
  log("worker_started", { queue: Queues.InboundEvents })
}
