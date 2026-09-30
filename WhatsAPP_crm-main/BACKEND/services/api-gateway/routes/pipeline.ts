import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { publish } from "../../../src/common/realtime"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, conflict, forbidden, notFound, parse } from "../../../src/http/errors"
import { normalizeTags } from "../../../src/crm/contacts"
import { normalizeWaId, toE164 } from "../../../src/whatsapp/phone"

const DEFAULT_STAGES = ["New", "Active", "Follow Up", "Converted"]

const DEAL_SELECT =
  "id,title,value,notes,tags,stage_id,created_at,stage_changed_at,converted_at," +
  "contacts(id,wa_id,display_name,phone_e164,company,profile_image_url,unread_count,last_message_at,last_message_preview)"

function toDealDTO(row: any) {
  const c = row.contacts || {}
  return {
    id: row.id,
    title: row.title || null,
    value: Number(row.value || 0),
    notes: row.notes || "",
    tags: row.tags || [],
    stage_id: row.stage_id,
    created_at: row.created_at,
    stage_changed_at: row.stage_changed_at,
    converted_at: row.converted_at,
    contact: row.contacts
      ? {
          id: c.id,
          wa_id: c.wa_id,
          name: c.display_name || c.phone_e164 || `+${c.wa_id}`,
          phone: c.phone_e164 || `+${c.wa_id}`,
          company: c.company,
          avatar_url: c.profile_image_url,
          unread_count: c.unread_count || 0,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview
        }
      : null
  }
}

export async function ensureStages(tenantId: string): Promise<{ id: number; name: string; ord: number }[]> {
  const s = supabaseAdmin()
  const existing = must(await s.from("pipeline_stages").select("id,name,ord").eq("tenant_id", tenantId).order("ord"), "list_stages") as any[]
  if (existing.length > 0) return existing
  await s.from("pipeline_stages").upsert(
    DEFAULT_STAGES.map((name, i) => ({ tenant_id: tenantId, name, ord: i + 1 })),
    { onConflict: "tenant_id,name", ignoreDuplicates: true }
  )
  return must(await s.from("pipeline_stages").select("id,name,ord").eq("tenant_id", tenantId).order("ord"), "list_stages") as any[]
}

async function getDeal(tenantId: string, id: number) {
  const { data } = await supabaseAdmin().from("deals").select(DEAL_SELECT).eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  if (!data) throw notFound("deal_not_found")
  return toDealDTO(data)
}

const createSchema = z.object({
  wa_id: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().optional(),
  company: z.string().trim().max(120).optional(),
  title: z.string().trim().max(160).optional(),
  value: z.coerce.number().min(0).max(1e12).default(0),
  notes: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  stage_id: z.coerce.number().int().optional()
})

const updateSchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
  value: z.coerce.number().min(0).max(1e12).optional(),
  notes: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  stage_id: z.coerce.number().int().optional()
})

export default async function pipelineRoutes(app: FastifyInstance) {
  app.get("/pipeline", async req => {
    const stages = await ensureStages(req.auth.tenantId)
    const deals = must(
      await supabaseAdmin().from("deals").select(DEAL_SELECT).eq("tenant_id", req.auth.tenantId).order("stage_changed_at", { ascending: false }).limit(2000),
      "list_deals"
    ) as any[]
    return { stages, deals: deals.map(toDealDTO) }
  })

  /** Creates a deal for an existing contact (wa_id) or for a new contact (name + phone). */
  app.post("/pipeline/deals", async (req, res) => {
    requireAdmin(req)
    const body = parse(createSchema, req.body)
    const tenantId = req.auth.tenantId
    const s = supabaseAdmin()
    const stages = await ensureStages(tenantId)
    const stage = body.stage_id ? stages.find(st => st.id === body.stage_id) : stages[0]
    if (!stage) throw badRequest("invalid_stage")

    const waId = body.wa_id || normalizeWaId(body.phone)
    if (!waId) throw badRequest("invalid_phone", "Enter the number in international format, e.g. +14155552671")

    let { data: contact } = await s.from("contacts").select("id,company").eq("tenant_id", tenantId).eq("wa_id", waId).maybeSingle()
    if (!contact) {
      if (body.wa_id) throw notFound("contact_not_found")
      if (!body.name) throw badRequest("name_required", "Name is required for a new contact")
      // Pipeline contacts always show up in the Inbox (PRD: Pipeline → Inbox sync).
      contact = must(
        await s.from("contacts").insert({
          tenant_id: tenantId,
          wa_id: waId,
          origin: "pipeline",
          display_name: body.name,
          phone_e164: toE164(waId),
          company: body.company || null,
          in_inbox: true
        }).select("id,company").single(),
        "create_contact"
      )
    } else {
      const patch: Record<string, unknown> = { in_inbox: true }
      if (body.company && !contact.company) patch.company = body.company
      await s.from("contacts").update(patch).eq("id", contact.id)
    }

    const { data: existing } = await s.from("deals").select("id").eq("tenant_id", tenantId).eq("contact_id", contact!.id).limit(1)
    if (existing && existing.length > 0) throw conflict("already_in_pipeline", "This contact already has a deal", { deal_id: existing[0]!.id })

    const isLast = stage.id === stages[stages.length - 1]!.id
    const now = new Date().toISOString()
    const row = must(
      await s.from("deals").insert({
        tenant_id: tenantId,
        contact_id: contact!.id,
        stage_id: stage.id,
        title: body.title || null,
        value: body.value,
        notes: body.notes || "",
        tags: normalizeTags(body.tags),
        created_at: now,
        stage_changed_at: now,
        converted_at: isLast ? now : null
      }).select(DEAL_SELECT).single(),
      "create_deal"
    )
    const deal = toDealDTO(row)
    await publish(tenantId, "deal.created", { deal })
    await publish(tenantId, "conversation.updated", { wa_id: waId })
    return res.status(201).send({ deal })
  })

  app.patch("/pipeline/deals/:id", async req => {
    const id = Number((req.params as any).id)
    const body = parse(updateSchema, req.body)
    // Agents have limited editing: they can move deals and keep notes, not change values.
    if (req.auth.role !== "admin" && (body.value !== undefined || body.tags !== undefined || body.title !== undefined)) {
      throw forbidden("admin_only", "Only admins can change deal value, title or tags")
    }
    const tenantId = req.auth.tenantId
    const current = await getDeal(tenantId, id)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) patch.title = body.title
    if (body.value !== undefined) patch.value = body.value
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.tags !== undefined) patch.tags = normalizeTags(body.tags)
    if (body.stage_id !== undefined && body.stage_id !== current.stage_id) {
      const stages = await ensureStages(tenantId)
      if (!stages.some(st => st.id === body.stage_id)) throw badRequest("invalid_stage")
      const now = new Date().toISOString()
      patch.stage_id = body.stage_id
      patch.stage_changed_at = now
      patch.converted_at = body.stage_id === stages[stages.length - 1]!.id ? now : null
    }
    must(await supabaseAdmin().from("deals").update(patch).eq("tenant_id", tenantId).eq("id", id), "update_deal")
    const deal = await getDeal(tenantId, id)
    await publish(tenantId, "deal.updated", { deal })
    if (deal.contact) await publish(tenantId, "contact.updated", { wa_id: deal.contact.wa_id })
    return { deal }
  })

  app.delete("/pipeline/deals/:id", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const deal = await getDeal(req.auth.tenantId, id)
    must(await supabaseAdmin().from("deals").delete().eq("tenant_id", req.auth.tenantId).eq("id", id), "delete_deal")
    await publish(req.auth.tenantId, "deal.deleted", { deal_id: id })
    if (deal.contact) await publish(req.auth.tenantId, "contact.updated", { wa_id: deal.contact.wa_id })
    return { success: true }
  })
}
