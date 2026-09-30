import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { publish } from "../../../src/common/realtime"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, conflict, notFound, parse } from "../../../src/http/errors"
import { CONTACT_SELECT, getContact, normalizeTags, sanitizeSearch, toContactDTO } from "../../../src/crm/contacts"
import { normalizeWaId, toE164 } from "../../../src/whatsapp/phone"

const listQuery = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  origin: z.enum(["inbox", "pipeline", "broadcast", "manual"]).optional(),
  audience: z.enum(["all", "inbox", "broadcast_only", "pipeline"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(50)
})

const customFields = z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().min(5),
  email: z.string().trim().email().optional().or(z.literal("")),
  company: z.string().trim().max(120).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(10000).optional(),
  custom_fields: customFields.optional(),
  add_to_inbox: z.boolean().default(true)
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  company: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(10000).optional(),
  custom_fields: customFields.optional()
})

const importSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().optional(),
    phone: z.union([z.string(), z.number()]),
    email: z.string().optional(),
    company: z.string().optional(),
    tags: z.array(z.string()).optional(),
    custom_fields: z.record(z.string(), z.any()).optional()
  })).min(1).max(20000),
  tags: z.array(z.string()).optional()
})

export default async function contactRoutes(app: FastifyInstance) {
  app.get("/contacts", async req => {
    const q = parse(listQuery, req.query)
    const s = supabaseAdmin()
    let query = s.from("contacts").select(CONTACT_SELECT, { count: "exact" }).eq("tenant_id", req.auth.tenantId)
    if (q.tag) query = query.contains("tags", [q.tag])
    if (q.origin) query = query.eq("origin", q.origin)
    if (q.audience === "inbox") query = query.eq("in_inbox", true)
    if (q.audience === "broadcast_only") query = query.eq("in_inbox", false)
    if (q.audience === "pipeline") query = query.not("deals", "is", null)
    const term = sanitizeSearch(q.q)
    if (term) {
      const digits = term.replace(/\D/g, "")
      query = query.or(
        [`display_name.ilike.*${term}*`, `company.ilike.*${term}*`, `email.ilike.*${term}*`, digits ? `wa_id.ilike.*${digits}*` : ""].filter(Boolean).join(",")
      )
    }
    const from = (q.page - 1) * q.page_size
    const res = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + q.page_size - 1)
    const rows = must(res, "list_contacts") as any[]
    return { contacts: rows.map(toContactDTO), total: res.count ?? rows.length, page: q.page, page_size: q.page_size }
  })

  app.get("/contacts/tags", async req => {
    const rows = must(
      await supabaseAdmin().from("contacts").select("tags").eq("tenant_id", req.auth.tenantId).not("tags", "eq", "{}").limit(10000),
      "list_tags"
    ) as any[]
    const counts = new Map<string, number>()
    for (const r of rows) for (const t of r.tags || []) counts.set(t, (counts.get(t) || 0) + 1)
    return { tags: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) }
  })

  app.get("/contacts/fields", async req => {
    const rows = must(
      await supabaseAdmin().from("contacts").select("custom_fields").eq("tenant_id", req.auth.tenantId).not("custom_fields", "eq", "{}").limit(2000),
      "list_fields"
    ) as any[]
    const keys = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r.custom_fields || {})) keys.add(k)
    return { fields: [...keys].sort() }
  })

  app.post("/contacts", async (req, res) => {
    const body = parse(createSchema, req.body)
    const waId = normalizeWaId(body.phone)
    if (!waId) throw badRequest("invalid_phone", "Enter the number in international format, e.g. +14155552671")
    const s = supabaseAdmin()
    const { data: existing } = await s.from("contacts").select("wa_id").eq("tenant_id", req.auth.tenantId).eq("wa_id", waId).maybeSingle()
    if (existing) throw conflict("contact_exists", "A contact with this number already exists", { wa_id: waId })
    const rows = must(
      await s.from("contacts").insert({
        tenant_id: req.auth.tenantId,
        wa_id: waId,
        origin: "manual",
        display_name: body.name,
        phone_e164: toE164(waId),
        email: body.email || null,
        company: body.company || null,
        tags: normalizeTags(body.tags),
        notes: body.notes || "",
        custom_fields: body.custom_fields || {},
        in_inbox: body.add_to_inbox
      }).select(CONTACT_SELECT),
      "create_contact"
    ) as any[]
    await publish(req.auth.tenantId, "contact.updated", { wa_id: waId })
    if (body.add_to_inbox) await publish(req.auth.tenantId, "conversation.updated", { wa_id: waId })
    return res.status(201).send({ contact: toContactDTO(rows[0]) })
  })

  app.get("/contacts/:waId", async req => {
    const { waId } = req.params as { waId: string }
    return { contact: await getContact(req.auth.tenantId, waId) }
  })

  app.patch("/contacts/:waId", async req => {
    const { waId } = req.params as { waId: string }
    const body = parse(updateSchema, req.body)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) patch.display_name = body.name
    if (body.email !== undefined) patch.email = body.email || null
    if (body.company !== undefined) patch.company = body.company || null
    if (body.tags !== undefined) patch.tags = normalizeTags(body.tags)
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.custom_fields !== undefined) patch.custom_fields = body.custom_fields
    const rows = must(
      await supabaseAdmin().from("contacts").update(patch).eq("tenant_id", req.auth.tenantId).eq("wa_id", waId).select(CONTACT_SELECT),
      "update_contact"
    ) as any[]
    if (rows.length === 0) throw notFound("contact_not_found")
    await publish(req.auth.tenantId, "contact.updated", { wa_id: waId })
    return { contact: toContactDTO(rows[0]) }
  })

  /** Permanently removes the contact, its deal, tasks and chat history. */
  app.delete("/contacts/:waId", async req => {
    requireAdmin(req)
    const { waId } = req.params as { waId: string }
    const s = supabaseAdmin()
    const contact = await getContact(req.auth.tenantId, waId)
    must(await s.from("deals").delete().eq("tenant_id", req.auth.tenantId).eq("contact_id", contact.id), "delete_deals")
    must(await s.from("messages").delete().eq("tenant_id", req.auth.tenantId).eq("thread_id", waId), "delete_messages")
    must(await s.from("contacts").delete().eq("id", contact.id), "delete_contact")
    await publish(req.auth.tenantId, "contact.updated", { wa_id: waId, deleted: true })
    await publish(req.auth.tenantId, "conversation.updated", { wa_id: waId, deleted: true })
    if (contact.deal) await publish(req.auth.tenantId, "deal.deleted", { deal_id: contact.deal.id })
    return { success: true }
  })

  /** Imports a broadcast list. New contacts stay out of the Inbox until they reply. */
  app.post("/contacts/import", { bodyLimit: 20 * 1024 * 1024 }, async req => {
    requireAdmin(req)
    const body = parse(importSchema, req.body)
    const rows: any[] = []
    const invalid: { row: number; phone: string; reason: string }[] = []
    body.contacts.forEach((c, i) => {
      const waId = normalizeWaId(c.phone)
      if (!waId) {
        invalid.push({ row: i + 1, phone: String(c.phone ?? ""), reason: "invalid_phone" })
        return
      }
      const email = c.email?.trim()
      rows.push({
        wa_id: waId,
        name: c.name?.trim().slice(0, 120),
        email: email && /.+@.+\..+/.test(email) ? email : undefined,
        company: c.company?.trim().slice(0, 120),
        tags: normalizeTags(c.tags),
        custom_fields: c.custom_fields || {}
      })
    })
    const tags = normalizeTags(body.tags)
    let inserted = 0
    let updated = 0
    for (let i = 0; i < rows.length; i += 1000) {
      const { data, error } = await supabaseAdmin().rpc("crm_import_contacts", {
        p_tenant: req.auth.tenantId,
        p_rows: rows.slice(i, i + 1000),
        p_tags: tags
      })
      if (error) throw new Error(`import_failed: ${error.message}`)
      inserted += Number((data as any)?.inserted || 0)
      updated += Number((data as any)?.updated || 0)
    }
    await publish(req.auth.tenantId, "contact.updated", { bulk: true })
    return { inserted, updated, invalid }
  })
}
