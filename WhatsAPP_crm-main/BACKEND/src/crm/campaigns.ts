import crypto from "crypto"
import { supabaseAdmin, must } from "../common/db"
import { queue } from "../common/queue"
import { Queues } from "../common/config"
import { publish } from "../common/realtime"
import { buildTemplateMessage, type VariableMapping } from "../whatsapp/templates"
import type { OutboundJob } from "./outbound"

export type CampaignStatus = "draft" | "scheduled" | "sending" | "completed" | "cancelled" | "failed"

export type Audience = {
  contact_ids?: number[]
  tags?: string[]
  audience?: "all" | "broadcast_only" | "inbox"
}

export type Segment = "not_replied" | "not_read" | "failed" | "replied"

const MAX_AUDIENCE = 100_000

/** Contact ids matching the audience, excluding contacts who opted out. */
export async function resolveAudience(tenantId: string, audience: Audience): Promise<number[]> {
  const s = supabaseAdmin()
  const ids: number[] = []
  const pageSize = 1000
  for (let from = 0; from < MAX_AUDIENCE; from += pageSize) {
    let q = s.from("contacts").select("id").eq("tenant_id", tenantId).eq("opted_out", false)
    if (audience.contact_ids && audience.contact_ids.length > 0) q = q.in("id", audience.contact_ids.slice(from, from + pageSize))
    if (audience.tags && audience.tags.length > 0) q = q.overlaps("tags", audience.tags)
    if (audience.audience === "broadcast_only") q = q.eq("in_inbox", false)
    if (audience.audience === "inbox") q = q.eq("in_inbox", true)
    if (!audience.contact_ids?.length) q = q.order("id").range(from, from + pageSize - 1)
    const rows = must(await q, "resolve_audience") as any[]
    ids.push(...rows.map(r => r.id))
    const exhausted = audience.contact_ids?.length ? from + pageSize >= audience.contact_ids.length : rows.length < pageSize
    if (exhausted) break
  }
  return [...new Set(ids)]
}

/** Recipients of a previous campaign, for follow-ups. */
export async function resolveSegment(tenantId: string, campaignId: number, segment: Segment): Promise<number[]> {
  let q = supabaseAdmin()
    .from("campaign_messages")
    .select("contact_id, contacts!inner(opted_out)")
    .eq("tenant_id", tenantId)
    .eq("campaign_id", campaignId)
    .eq("contacts.opted_out", false)
    .not("contact_id", "is", null)
  if (segment === "not_replied") q = q.not("sent_at", "is", null).is("replied_at", null)
  if (segment === "not_read") q = q.not("sent_at", "is", null).is("read_at", null).is("replied_at", null)
  if (segment === "failed") q = q.eq("status", "failed")
  if (segment === "replied") q = q.not("replied_at", "is", null)
  const rows = must(await q.limit(MAX_AUDIENCE), "resolve_segment") as any[]
  return [...new Set(rows.map(r => r.contact_id as number))]
}

export async function addRecipients(tenantId: string, campaignId: number, contactIds: number[]) {
  const s = supabaseAdmin()
  for (let i = 0; i < contactIds.length; i += 1000) {
    must(
      await s.from("campaign_messages").upsert(
        contactIds.slice(i, i + 1000).map(contact_id => ({ tenant_id: tenantId, campaign_id: campaignId, contact_id, status: "pending" })),
        { onConflict: "campaign_id,contact_id", ignoreDuplicates: true }
      ),
      "add_recipients"
    )
  }
}

export async function scheduleDispatch(campaignId: number, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now())
  const q = queue(Queues.CampaignDispatch)
  const jobId = `campaign-${campaignId}`
  const existing = await q.getJob(jobId)
  if (existing) await existing.remove().catch(() => {})
  await q.add("dispatch", { campaign_id: campaignId }, { jobId, delay, attempts: 3 })
}

export async function cancelDispatch(campaignId: number) {
  const job = await queue(Queues.CampaignDispatch).getJob(`campaign-${campaignId}`)
  if (job) await job.remove().catch(() => {})
}

async function failCampaign(campaign: any, message: string) {
  await supabaseAdmin().from("campaigns").update({ status: "failed", last_error: message, completed_at: new Date().toISOString() }).eq("id", campaign.id)
  await publish(campaign.tenant_id, "campaign.updated", { campaign_id: campaign.id })
}

/**
 * Turns pending recipients into queued outbound messages, 500 at a time.
 * Each recipient gets the template rendered with their own fields.
 */
export async function dispatchCampaign(campaignId: number) {
  const s = supabaseAdmin()
  const { data: campaign } = await s.from("campaigns").select("*").eq("id", campaignId).maybeSingle()
  if (!campaign) return
  const claimed = must(
    await s.from("campaigns")
      .update({ status: "sending", started_at: new Date().toISOString(), last_error: null })
      .eq("id", campaignId)
      .eq("status", "scheduled")
      .select("id"),
    "claim_campaign"
  ) as any[]
  if (claimed.length === 0) return

  const { data: template } = await s
    .from("templates")
    .select("name,language,status,components,parameter_format")
    .eq("tenant_id", campaign.tenant_id)
    .eq("name", campaign.template_name)
    .eq("language", campaign.template_language)
    .maybeSingle()
  if (!template || String(template.status).toUpperCase() !== "APPROVED") {
    await s.from("campaign_messages").update({ status: "skipped" }).eq("campaign_id", campaignId).eq("status", "pending")
    return failCampaign(campaign, "Template is missing or no longer approved")
  }

  const mapping = (campaign.variables || {}) as VariableMapping
  for (let batch = 0; batch < 500; batch++) {
    const { data: fresh } = await s.from("campaigns").select("status").eq("id", campaignId).single()
    if (fresh?.status !== "sending") return

    const recipients = must(
      await s.from("campaign_messages")
        .select("id,contact_id,contacts(id,wa_id,display_name,phone_e164,email,company,custom_fields,opted_out)")
        .eq("campaign_id", campaignId)
        .eq("status", "pending")
        .order("id")
        .limit(500),
      "load_recipients"
    ) as any[]
    if (recipients.length === 0) break

    const now = new Date().toISOString()
    const messages: any[] = []
    const updates: any[] = []
    const jobs: { name: string; data: OutboundJob & { campaign_id: number }; opts: { jobId: string } }[] = []
    for (const r of recipients) {
      const c = r.contacts
      if (!c || c.opted_out || !c.wa_id) {
        updates.push({ id: r.id, campaign_id: campaignId, contact_id: r.contact_id, tenant_id: campaign.tenant_id, status: "skipped" })
        continue
      }
      const { payload } = buildTemplateMessage(template as any, mapping, c, campaign.header_media_url)
      const id = crypto.randomUUID()
      messages.push({
        id,
        tenant_id: campaign.tenant_id,
        thread_id: c.wa_id,
        direction: "out",
        type: "template",
        payload_json: payload,
        status: "queued",
        campaign_id: campaignId,
        sent_by: campaign.created_by,
        created_at: now
      })
      updates.push({ id: r.id, campaign_id: campaignId, contact_id: r.contact_id, tenant_id: campaign.tenant_id, status: "queued", message_id: id })
      jobs.push({
        name: "send",
        data: { tenant_id: campaign.tenant_id, message_id: id, to: c.wa_id, phone_number_id: campaign.phone_number_id || undefined, campaign_id: campaignId },
        opts: { jobId: id }
      })
    }
    if (messages.length > 0) must(await s.from("messages").insert(messages), "insert_campaign_messages")
    must(await s.from("campaign_messages").upsert(updates, { onConflict: "id" }), "queue_recipients")
    if (jobs.length > 0) await queue(Queues.OutboundMessages).addBulk(jobs)
    await publish(campaign.tenant_id, "campaign.updated", { campaign_id: campaignId })
  }
  if (!(await checkCampaignCompletion(campaign.tenant_id, campaignId))) {
    await scheduleCompletionCheck(campaign.tenant_id, campaignId)
  }
}

/**
 * Marks a sending campaign completed once no recipient is waiting to be sent.
 * Returns true when the campaign is finished (or no longer sending).
 */
export async function checkCampaignCompletion(tenantId: string, campaignId: number): Promise<boolean> {
  const s = supabaseAdmin()
  const { count } = await s
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
  if ((count ?? 0) > 0) {
    const { data } = await s.from("campaigns").select("status").eq("id", campaignId).maybeSingle()
    return data?.status !== "sending"
  }
  const done = must(
    await s.from("campaigns").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId).eq("status", "sending").select("id"),
    "complete_campaign"
  ) as any[]
  if (done.length > 0) await publish(tenantId, "campaign.updated", { campaign_id: campaignId })
  return true
}

/** Polls completion every 10s until the campaign finishes; job ids are time-bucketed so polls never pile up. */
export async function scheduleCompletionCheck(tenantId: string, campaignId: number, delayMs = 10_000) {
  const bucket = Math.floor((Date.now() + delayMs) / 10_000)
  await queue(Queues.CampaignDispatch).add(
    "check",
    { campaign_id: campaignId, tenant_id: tenantId },
    { jobId: `check-${campaignId}-${bucket}`, delay: delayMs, removeOnComplete: true, removeOnFail: true, attempts: 3 }
  )
}

/** Stops a campaign: nothing further is sent; messages already accepted by WhatsApp are unaffected. */
export async function cancelCampaign(tenantId: string, campaignId: number) {
  const s = supabaseAdmin()
  await cancelDispatch(campaignId)
  const rows = must(
    await s.from("campaigns").update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("tenant_id", tenantId).eq("id", campaignId).in("status", ["draft", "scheduled", "sending"]).select("id"),
    "cancel_campaign"
  ) as any[]
  if (rows.length === 0) return false
  await s.from("campaign_messages").update({ status: "skipped" }).eq("campaign_id", campaignId).eq("status", "pending")
  await publish(tenantId, "campaign.updated", { campaign_id: campaignId })
  return true
}
