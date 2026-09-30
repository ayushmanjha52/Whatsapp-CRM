import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { redis } from "../../../src/common/queue"
import { publish } from "../../../src/common/realtime"
import { requireAdmin } from "../../../src/http/auth"
import { notFound, parse, unprocessable, HttpError } from "../../../src/http/errors"
import { CONTACT_SELECT, getContact, sanitizeSearch, toContactDTO } from "../../../src/crm/contacts"
import { queueOutboundMessage } from "../../../src/crm/outbound"
import { toMessageDTO } from "../../../src/whatsapp/messages"
import { buildTemplateMessage, templateShape, assertMappingComplete, TemplateMappingError, type VariableMapping } from "../../../src/whatsapp/templates"
import { getTenantWhatsApp } from "../../../src/whatsapp/credentials"
import { markRead } from "../../../src/whatsapp/graph"

const listQuery = z.object({
  filter: z.enum(["all", "unread", "vip", "archived"]).default("all"),
  q: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(4096) }),
  z.object({
    type: z.literal("media"),
    kind: z.enum(["image", "video", "audio", "document"]),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
    filename: z.string().max(240).optional()
  }),
  z.object({
    type: z.literal("template"),
    template_name: z.string().min(1),
    language: z.string().min(2),
    variables: z.record(z.string(), z.string()).default({}),
    header_media_url: z.string().url().optional()
  })
])

const SEND_LIMIT_PER_MINUTE = Number(process.env.SEND_RATE_LIMIT_PER_MINUTE || 120)

async function enforceSendRate(tenantId: string) {
  const r = redis()
  const key = `rl:send:${tenantId}:${Math.floor(Date.now() / 60000)}`
  const count = await r.incr(key)
  if (count === 1) await r.expire(key, 70)
  if (count > SEND_LIMIT_PER_MINUTE) throw new HttpError(429, "rate_limited", "Too many messages, slow down a little")
}

export default async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", async req => {
    const q = parse(listQuery, req.query)
    const s = supabaseAdmin()
    let query = s
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("tenant_id", req.auth.tenantId)
      .eq("in_inbox", true)
      .eq("archived", q.filter === "archived")
    if (q.filter === "unread") query = query.gt("unread_count", 0)
    if (q.filter === "vip") query = query.contains("tags", ["VIP"])
    const term = sanitizeSearch(q.q)
    if (term) query = query.or(`display_name.ilike.*${term}*,wa_id.ilike.*${term.replace(/\D/g, "") || term}*,company.ilike.*${term}*`)
    const rows = must(
      await query.order("last_message_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).range(q.offset, q.offset + q.limit),
      "list_conversations"
    ) as any[]

    const { count: unread } = await s
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", req.auth.tenantId)
      .eq("in_inbox", true)
      .eq("archived", false)
      .gt("unread_count", 0)

    return {
      conversations: rows.slice(0, q.limit).map(toContactDTO),
      has_more: rows.length > q.limit,
      counts: { unread: unread ?? 0 }
    }
  })

  app.get("/conversations/:waId", async req => {
    const { waId } = req.params as { waId: string }
    return { contact: await getContact(req.auth.tenantId, waId) }
  })

  app.get("/conversations/:waId/messages", async req => {
    const { waId } = req.params as { waId: string }
    const q = parse(z.object({ before: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query)
    let query = supabaseAdmin()
      .from("messages")
      .select("*")
      .eq("tenant_id", req.auth.tenantId)
      .eq("thread_id", waId)
    if (q.before) query = query.lt("created_at", q.before)
    const rows = must(await query.order("created_at", { ascending: false }).limit(q.limit + 1), "list_messages") as any[]
    return {
      messages: rows.slice(0, q.limit).reverse().map(toMessageDTO),
      has_more: rows.length > q.limit
    }
  })

  app.post("/conversations/:waId/messages", async (req, res) => {
    const { waId } = req.params as { waId: string }
    const body = parse(sendSchema, req.body)
    const contact = await getContact(req.auth.tenantId, waId)
    await enforceSendRate(req.auth.tenantId)

    let payload: Record<string, any>
    if (body.type === "template") {
      const { data: tpl } = await supabaseAdmin()
        .from("templates")
        .select("name,language,status,category,components,parameter_format")
        .eq("tenant_id", req.auth.tenantId)
        .eq("name", body.template_name)
        .eq("language", body.language)
        .maybeSingle()
      if (!tpl) throw notFound("template_not_found", "Template not found — sync templates first")
      if (String(tpl.status).toUpperCase() !== "APPROVED") throw unprocessable("template_not_approved", "Only approved templates can be sent")
      const mapping: VariableMapping = {}
      for (const [k, v] of Object.entries(body.variables)) mapping[k] = { source: "static", value: v }
      try {
        assertMappingComplete(templateShape(tpl.components), mapping, body.header_media_url)
      } catch (e) {
        if (e instanceof TemplateMappingError) throw unprocessable("template_variables_missing", "Fill in every template variable", e.missing)
        throw e
      }
      payload = buildTemplateMessage(tpl as any, mapping, { wa_id: contact.wa_id, display_name: contact.name }, body.header_media_url).payload
    } else {
      if (!contact.window_open) {
        throw unprocessable(
          "window_closed",
          "More than 24 hours have passed since this customer last wrote. Send an approved template to restart the conversation."
        )
      }
      if (body.type === "text") {
        payload = { type: "text", text: { body: body.text, preview_url: /https?:\/\//.test(body.text) } }
      } else {
        const media: Record<string, string> = { link: body.url }
        if (body.caption && body.kind !== "audio") media.caption = body.caption
        if (body.filename && body.kind === "document") media.filename = body.filename
        payload = { type: body.kind, [body.kind]: media }
      }
    }

    const message = await queueOutboundMessage({
      tenantId: req.auth.tenantId,
      contactId: contact.id,
      waId: contact.wa_id,
      payload,
      sentBy: req.auth.userId
    })
    return res.status(202).send({ message })
  })

  app.post("/conversations/:waId/read", async req => {
    const { waId } = req.params as { waId: string }
    const s = supabaseAdmin()
    const { data } = await s
      .from("contacts")
      .update({ unread_count: 0 })
      .eq("tenant_id", req.auth.tenantId)
      .eq("wa_id", waId)
      .gt("unread_count", 0)
      .select("id")
    if (data && data.length > 0) {
      await publish(req.auth.tenantId, "conversation.updated", { wa_id: waId })
      // Blue ticks for the customer, best effort.
      void (async () => {
        const { data: last } = await s
          .from("messages")
          .select("wamid")
          .eq("tenant_id", req.auth.tenantId)
          .eq("thread_id", waId)
          .eq("direction", "in")
          .order("created_at", { ascending: false })
          .limit(1)
        const wamid = last?.[0]?.wamid
        const wa = wamid ? await getTenantWhatsApp(req.auth.tenantId) : null
        if (wa && wamid) await markRead(wa.phoneNumberId, wa.token, wamid)
      })().catch(e => req.log.warn({ err: e?.message }, "mark_read_failed"))
    }
    return { success: true }
  })

  app.post("/conversations/:waId/archive", async req => {
    const { waId } = req.params as { waId: string }
    const body = parse(z.object({ archived: z.boolean() }), req.body)
    const rows = must(
      await supabaseAdmin()
        .from("contacts")
        .update({ archived: body.archived, updated_at: new Date().toISOString() })
        .eq("tenant_id", req.auth.tenantId)
        .eq("wa_id", waId)
        .select(CONTACT_SELECT),
      "archive_conversation"
    ) as any[]
    if (rows.length === 0) throw notFound("contact_not_found")
    await publish(req.auth.tenantId, "conversation.updated", { wa_id: waId })
    return { contact: toContactDTO(rows[0]) }
  })

  /** Clears the chat history and removes it from the Inbox. The contact, deal and lists are kept. */
  app.delete("/conversations/:waId", async req => {
    requireAdmin(req)
    const { waId } = req.params as { waId: string }
    const s = supabaseAdmin()
    const contact = await getContact(req.auth.tenantId, waId)
    must(await s.from("messages").delete().eq("tenant_id", req.auth.tenantId).eq("thread_id", waId), "delete_messages")
    must(
      await s.from("contacts").update({
        in_inbox: false,
        archived: false,
        unread_count: 0,
        last_message_at: null,
        last_message_preview: null,
        last_message_direction: null
      }).eq("id", contact.id),
      "hide_conversation"
    )
    await publish(req.auth.tenantId, "conversation.updated", { wa_id: waId, deleted: true })
    return { success: true }
  })
}
