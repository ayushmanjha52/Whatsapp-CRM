import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { publish } from "../../../src/common/realtime"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, conflict, notFound, parse, unprocessable } from "../../../src/http/errors"
import { getTenantWhatsApp } from "../../../src/whatsapp/credentials"
import { assertMappingComplete, TemplateMappingError, templateShape } from "../../../src/whatsapp/templates"
import {
  addRecipients, cancelCampaign, resolveAudience, resolveSegment, scheduleDispatch, type Audience, type Segment
} from "../../../src/crm/campaigns"
import { assertFeature } from "../../../src/billing/entitlements"

const variableSource = z.discriminatedUnion("source", [
  z.object({ source: z.literal("field"), field: z.string().min(1), fallback: z.string().max(200).optional() }),
  z.object({ source: z.literal("static"), value: z.string().max(1000) })
])

const audienceSchema = z.object({
  contact_ids: z.array(z.number().int()).max(100000).optional(),
  tags: z.array(z.string()).max(50).optional(),
  audience: z.enum(["all", "broadcast_only", "inbox"]).optional()
})

const messageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  template_name: z.string().min(1),
  template_language: z.string().min(2),
  variables: z.record(z.string(), variableSource).default({}),
  header_media_url: z.string().url().optional().nullable(),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
  send: z.boolean().default(true)
})

const createSchema = messageSchema.extend({ audience: audienceSchema })
const followUpSchema = messageSchema.extend({ segment: z.enum(["not_replied", "not_read", "failed", "replied"]) })

const EMPTY_STATS = { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 }

async function statsFor(ids: number[]) {
  if (ids.length === 0) return new Map<number, typeof EMPTY_STATS>()
  const rows = must(await supabaseAdmin().from("campaign_stats").select("*").in("campaign_id", ids), "campaign_stats") as any[]
  return new Map(rows.map(r => [Number(r.campaign_id), { ...EMPTY_STATS, ...r }]))
}

function toCampaignDTO(row: any, stats = EMPTY_STATS) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    template_name: row.template_name,
    template_language: row.template_language,
    variables: row.variables || {},
    header_media_url: row.header_media_url,
    scheduled_at: row.scheduled_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    parent_campaign_id: row.parent_campaign_id,
    last_error: row.last_error,
    stats: {
      ...stats,
      reply_rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 1000) / 10 : 0,
      read_rate: stats.sent > 0 ? Math.round((stats.read / stats.sent) * 1000) / 10 : 0
    }
  }
}

async function loadCampaign(tenantId: string, id: number) {
  const { data } = await supabaseAdmin().from("campaigns").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  if (!data) throw notFound("campaign_not_found")
  return data
}

async function validateTemplate(tenantId: string, body: z.infer<typeof messageSchema>) {
  const { data: tpl } = await supabaseAdmin()
    .from("templates")
    .select("name,language,status,components")
    .eq("tenant_id", tenantId)
    .eq("name", body.template_name)
    .eq("language", body.template_language)
    .maybeSingle()
  if (!tpl) throw notFound("template_not_found", "Template not found — sync templates first")
  if (String(tpl.status).toUpperCase() !== "APPROVED") throw unprocessable("template_not_approved", "Only approved templates can be broadcast")
  try {
    assertMappingComplete(templateShape(tpl.components), body.variables, body.header_media_url)
  } catch (e) {
    if (e instanceof TemplateMappingError) throw unprocessable("template_variables_missing", "Map every template variable", e.missing)
    throw e
  }
}

/** Creates the campaign row + recipient snapshot, and schedules it unless saved as a draft. */
async function createCampaign(req: any, body: z.infer<typeof messageSchema>, contactIds: number[], parentId: number | null) {
  const tenantId = req.auth.tenantId
  await assertFeature(tenantId, "broadcasts")
  if (contactIds.length === 0) throw unprocessable("empty_audience", "No contacts match this audience (opted-out contacts are excluded)")
  const wa = await getTenantWhatsApp(tenantId)
  if (!wa) throw unprocessable("whatsapp_not_connected", "Connect a WhatsApp number in Settings first")
  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
  if (body.scheduled_at && scheduledAt.getTime() < Date.now() - 60_000) throw badRequest("schedule_in_past", "Pick a time in the future")

  const campaign = must(
    await supabaseAdmin().from("campaigns").insert({
      tenant_id: tenantId,
      name: body.name,
      template_id: body.template_name,
      template_name: body.template_name,
      template_language: body.template_language,
      variables: body.variables,
      header_media_url: body.header_media_url || null,
      phone_number_id: wa.phoneNumberId,
      status: "draft",
      scheduled_at: body.send ? scheduledAt.toISOString() : null,
      parent_campaign_id: parentId,
      created_by: req.auth.userId
    }).select("*").single(),
    "create_campaign"
  )
  await addRecipients(tenantId, campaign.id, contactIds)
  if (body.send) {
    must(await supabaseAdmin().from("campaigns").update({ status: "scheduled" }).eq("id", campaign.id), "schedule_campaign")
    await scheduleDispatch(campaign.id, scheduledAt)
    campaign.status = "scheduled"
  }
  await publish(tenantId, "campaign.updated", { campaign_id: campaign.id })
  const stats = await statsFor([campaign.id])
  return toCampaignDTO(campaign, stats.get(campaign.id))
}

export default async function campaignRoutes(app: FastifyInstance) {
  app.get("/campaigns", async req => {
    const rows = must(
      await supabaseAdmin().from("campaigns").select("*").eq("tenant_id", req.auth.tenantId).order("created_at", { ascending: false }).limit(200),
      "list_campaigns"
    ) as any[]
    const stats = await statsFor(rows.map(r => r.id))
    return { campaigns: rows.map(r => toCampaignDTO(r, stats.get(r.id))) }
  })

  app.post("/campaigns/audience-preview", async req => {
    const body = parse(audienceSchema, req.body)
    const ids = await resolveAudience(req.auth.tenantId, body as Audience)
    return { count: ids.length }
  })

  app.get("/campaigns/:id", async req => {
    const id = Number((req.params as any).id)
    const q = parse(z.object({
      status: z.enum(["all", "pending", "queued", "sent", "delivered", "read", "failed", "skipped", "replied"]).default("all"),
      page: z.coerce.number().int().min(1).default(1)
    }), req.query)
    const campaign = await loadCampaign(req.auth.tenantId, id)
    const stats = await statsFor([id])
    let rq = supabaseAdmin()
      .from("campaign_messages")
      .select("id,status,error,sent_at,delivered_at,read_at,failed_at,replied_at,contacts(wa_id,display_name,phone_e164,in_inbox)", { count: "exact" })
      .eq("campaign_id", id)
    if (q.status === "replied") rq = rq.not("replied_at", "is", null)
    else if (q.status !== "all") rq = rq.eq("status", q.status)
    const pageSize = 50
    const res = await rq.order("id").range((q.page - 1) * pageSize, q.page * pageSize - 1)
    const recipients = (must(res, "list_recipients") as any[]).map(r => ({
      id: r.id,
      status: r.status,
      error: r.error,
      sent_at: r.sent_at,
      delivered_at: r.delivered_at,
      read_at: r.read_at,
      failed_at: r.failed_at,
      replied_at: r.replied_at,
      contact: r.contacts
        ? { wa_id: r.contacts.wa_id, name: r.contacts.display_name || r.contacts.phone_e164, phone: r.contacts.phone_e164, in_inbox: r.contacts.in_inbox }
        : null
    }))
    const { data: children } = await supabaseAdmin().from("campaigns").select("id,name,status,created_at").eq("parent_campaign_id", id).order("created_at")
    return {
      campaign: toCampaignDTO(campaign, stats.get(id)),
      recipients,
      recipients_total: res.count ?? recipients.length,
      page: q.page,
      page_size: pageSize,
      follow_ups: children || []
    }
  })

  app.post("/campaigns", async (req, res) => {
    requireAdmin(req)
    const body = parse(createSchema, req.body)
    await validateTemplate(req.auth.tenantId, body)
    const ids = await resolveAudience(req.auth.tenantId, body.audience as Audience)
    return res.status(201).send({ campaign: await createCampaign(req, body, ids, null) })
  })

  app.post("/campaigns/:id/follow-up", async (req, res) => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const body = parse(followUpSchema, req.body)
    await loadCampaign(req.auth.tenantId, id)
    await validateTemplate(req.auth.tenantId, body)
    const ids = await resolveSegment(req.auth.tenantId, id, body.segment as Segment)
    return res.status(201).send({ campaign: await createCampaign(req, body, ids, id) })
  })

  app.post("/campaigns/:id/send", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const body = parse(z.object({ scheduled_at: z.string().datetime({ offset: true }).optional().nullable() }), req.body)
    const campaign = await loadCampaign(req.auth.tenantId, id)
    if (campaign.status !== "draft") throw conflict("not_a_draft", "Only draft campaigns can be sent")
    await assertFeature(req.auth.tenantId, "broadcasts")
    const at = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
    must(await supabaseAdmin().from("campaigns").update({ status: "scheduled", scheduled_at: at.toISOString() }).eq("id", id), "schedule_campaign")
    await scheduleDispatch(id, at)
    await publish(req.auth.tenantId, "campaign.updated", { campaign_id: id })
    const stats = await statsFor([id])
    return { campaign: toCampaignDTO({ ...campaign, status: "scheduled", scheduled_at: at.toISOString() }, stats.get(id)) }
  })

  app.post("/campaigns/:id/cancel", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const ok = await cancelCampaign(req.auth.tenantId, id)
    if (!ok) throw conflict("not_cancellable", "This campaign has already finished")
    return { success: true }
  })

  app.delete("/campaigns/:id", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const campaign = await loadCampaign(req.auth.tenantId, id)
    if (["scheduled", "sending"].includes(campaign.status)) throw conflict("campaign_active", "Cancel the campaign before deleting it")
    must(await supabaseAdmin().from("campaigns").delete().eq("tenant_id", req.auth.tenantId).eq("id", id), "delete_campaign")
    await publish(req.auth.tenantId, "campaign.updated", { campaign_id: id, deleted: true })
    return { success: true }
  })
}
