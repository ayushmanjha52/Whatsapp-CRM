import type { Job } from "bullmq"
import { worker, redis } from "../../src/common/queue"
import { assertEnv, Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import { publish } from "../../src/common/realtime"
import { getTenantWhatsApp, type TenantWhatsApp } from "../../src/whatsapp/credentials"
import { GraphError, sendMessage } from "../../src/whatsapp/graph"
import { stripLocalFields } from "../../src/whatsapp/templates"
import type { OutboundJob } from "../../src/crm/outbound"

type Job_ = OutboundJob & { campaign_id?: number }

const credCache = new Map<string, { wa: TenantWhatsApp | null; exp: number }>()
const campaignStatusCache = new Map<number, { status: string; exp: number }>()

async function credentials(tenantId: string, phoneNumberId?: string) {
  const key = `${tenantId}:${phoneNumberId || ""}`
  const hit = credCache.get(key)
  if (hit && hit.exp > Date.now()) return hit.wa
  const wa = await getTenantWhatsApp(tenantId, phoneNumberId)
  credCache.set(key, { wa, exp: Date.now() + 60_000 })
  return wa
}

async function campaignStatus(id: number): Promise<string> {
  const hit = campaignStatusCache.get(id)
  if (hit && hit.exp > Date.now()) return hit.status
  const { data } = await supabaseAdmin().from("campaigns").select("status").eq("id", id).maybeSingle()
  const status = data?.status || "missing"
  campaignStatusCache.set(id, { status, exp: Date.now() + 5_000 })
  return status
}

/** At most one campaign.updated event per campaign every 2s, so large sends don't flood clients. */
async function publishCampaignThrottled(tenantId: string, campaignId: number) {
  const ok = await redis().set(`campaign:evt:${campaignId}`, "1", "PX", 2000, "NX")
  if (ok) await publish(tenantId, "campaign.updated", { campaign_id: campaignId })
}

async function markFailed(tenantId: string, messageId: string, waId: string, error: Record<string, unknown>, campaignId?: number | null) {
  const { error: rpcError } = await supabaseAdmin().rpc("crm_mark_message_failed", { p_message_id: messageId, p_error: error })
  if (rpcError) throw new Error(`mark_failed_failed: ${rpcError.message}`)
  await publish(tenantId, "message.updated", { wa_id: waId, message: { id: messageId, status: "failed", error } })
  if (campaignId) await publishCampaignThrottled(tenantId, campaignId)
  console.log(JSON.stringify({ event: "outbound_failed", tenant_id: tenantId, message_id: messageId, error }))
}

async function processOutbound(job: Job<Job_>) {
  const d = job.data
  if (!d?.message_id) {
    console.warn(JSON.stringify({ event: "outbound_legacy_job_dropped", job_id: job.id }))
    return
  }
  const s = supabaseAdmin()
  const { data: msg } = await s
    .from("messages")
    .select("id,tenant_id,thread_id,payload_json,status,campaign_id")
    .eq("id", d.message_id)
    .maybeSingle()
  if (!msg || msg.status !== "queued") return

  if (msg.campaign_id && (await campaignStatus(msg.campaign_id)) === "cancelled") {
    await s.from("campaign_messages").update({ status: "skipped" }).eq("message_id", msg.id)
    await s.from("messages").delete().eq("id", msg.id)
    return
  }

  const wa = await credentials(msg.tenant_id, d.phone_number_id)
  if (!wa) return markFailed(msg.tenant_id, msg.id, msg.thread_id, { title: "WhatsApp is not connected" }, msg.campaign_id)

  let wamid: string | undefined
  try {
    const res = await sendMessage(wa.phoneNumberId, wa.token, msg.thread_id, stripLocalFields(msg.payload_json || {}))
    wamid = res.messages?.[0]?.id
  } catch (e: any) {
    const maxAttempts = job.opts.attempts ?? 1
    if (e instanceof GraphError && e.retryable && job.attemptsMade + 1 < maxAttempts) throw e
    const error = e instanceof GraphError ? e.toJSON() : { title: "send_failed", message: String(e?.message || e) }
    return markFailed(msg.tenant_id, msg.id, msg.thread_id, error, msg.campaign_id)
  }
  if (!wamid) return markFailed(msg.tenant_id, msg.id, msg.thread_id, { title: "WhatsApp returned no message id" }, msg.campaign_id)

  const { data, error } = await s.rpc("crm_mark_message_sent", { p_message_id: msg.id, p_wamid: wamid })
  if (error) throw new Error(`mark_sent_failed: ${error.message}`)
  await publish(msg.tenant_id, "message.updated", { wa_id: msg.thread_id, message: { id: msg.id, status: (data as any)?.status || "sent" } })
  if (msg.campaign_id) await publishCampaignThrottled(msg.tenant_id, msg.campaign_id)
  console.log(JSON.stringify({ event: "outbound_sent", tenant_id: msg.tenant_id, message_id: msg.id, wamid }))
}

export function startSenderWorker() {
  assertEnv("messaging-worker", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "DATA_ENCRYPTION_KEY"])
  worker(Queues.OutboundMessages, processOutbound, {
    concurrency: Number(process.env.WORKER_CONCURRENCY_OUTBOUND || 20),
    // Cloud API default throughput is 80 msg/s per number; stay under it.
    limiter: { max: Number(process.env.OUTBOUND_RATE_PER_SECOND || 50), duration: 1000 }
  })
  console.log(JSON.stringify({ event: "worker_started", queue: Queues.OutboundMessages }))
}

if (import.meta.main) startSenderWorker()
