import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { publish } from "../../../src/common/realtime"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, parse, unprocessable } from "../../../src/http/errors"
import { getTenantWhatsApp } from "../../../src/whatsapp/credentials"
import { createTemplate, deleteTemplate, GraphError, listTemplates } from "../../../src/whatsapp/graph"
import { buildCreateTemplateRequest, templateShape } from "../../../src/whatsapp/templates"

function toTemplateDTO(row: any) {
  return {
    id: row.id,
    meta_id: row.meta_id,
    name: row.name,
    language: row.language,
    category: row.category,
    status: String(row.status || "").toUpperCase(),
    rejected_reason: row.rejected_reason,
    parameter_format: row.parameter_format,
    components: row.components || [],
    shape: templateShape(row.components || []),
    updated_at: row.updated_at
  }
}

async function requireWhatsApp(tenantId: string) {
  const wa = await getTenantWhatsApp(tenantId)
  if (!wa) throw unprocessable("whatsapp_not_connected", "Connect a WhatsApp number in Settings first")
  return wa
}

function graphFailure(e: unknown): never {
  if (e instanceof GraphError) throw badRequest("whatsapp_error", e.details || e.message, e.toJSON())
  throw e
}

/** Pulls every template from Meta and mirrors it locally (removing ones deleted on Meta). */
export async function syncTemplates(tenantId: string): Promise<number> {
  const wa = await requireWhatsApp(tenantId)
  let remote: any[]
  try {
    remote = await listTemplates(wa.wabaId, wa.token)
  } catch (e) {
    graphFailure(e)
  }
  const s = supabaseAdmin()
  const now = new Date().toISOString()
  if (remote.length > 0) {
    must(
      await s.from("templates").upsert(
        remote.map(t => ({
          tenant_id: tenantId,
          waba_id: wa.wabaId,
          meta_id: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components || [],
          parameter_format: t.parameter_format || null,
          rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
          updated_at: now
        })),
        { onConflict: "tenant_id,name,language" }
      ),
      "upsert_templates"
    )
  }
  const keep = new Set(remote.map(t => `${t.name}::${t.language}`))
  const local = must(await s.from("templates").select("id,name,language").eq("tenant_id", tenantId), "list_templates") as any[]
  const stale = local.filter(t => !keep.has(`${t.name}::${t.language}`)).map(t => t.id)
  if (stale.length > 0) await s.from("templates").delete().in("id", stale)
  return remote.length
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(10).default("en_US"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).default("MARKETING"),
  header_text: z.string().trim().max(60).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60).optional().or(z.literal("")),
  examples: z.record(z.string(), z.string()).optional(),
  buttons: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
    z.object({ type: z.literal("URL"), text: z.string().trim().min(1).max(25), url: z.string().url() }),
    z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().trim().min(1).max(25), phone_number: z.string().min(6) })
  ])).max(10).optional()
})

export default async function templateRoutes(app: FastifyInstance) {
  app.get("/templates", async req => {
    const rows = must(
      await supabaseAdmin().from("templates").select("*").eq("tenant_id", req.auth.tenantId).order("updated_at", { ascending: false }),
      "list_templates"
    ) as any[]
    return { templates: rows.map(toTemplateDTO) }
  })

  app.post("/templates/sync", async req => {
    requireAdmin(req)
    const count = await syncTemplates(req.auth.tenantId)
    await publish(req.auth.tenantId, "template.updated", {})
    return { synced: count }
  })

  app.post("/templates", async (req, res) => {
    requireAdmin(req)
    const body = parse(createSchema, req.body)
    const wa = await requireWhatsApp(req.auth.tenantId)
    let request: ReturnType<typeof buildCreateTemplateRequest>
    try {
      request = buildCreateTemplateRequest({
        ...body,
        header_text: body.header_text || undefined,
        footer: body.footer || undefined
      })
    } catch (e: any) {
      throw badRequest(e.message, "Variables must be numbered {{1}}, {{2}}, … in order, or all be named like {{first_name}}")
    }
    let created: { id: string; status: string; category: string }
    try {
      created = await createTemplate(wa.wabaId, wa.token, request)
    } catch (e) {
      graphFailure(e)
    }
    const row = must(
      await supabaseAdmin().from("templates").upsert({
        tenant_id: req.auth.tenantId,
        waba_id: wa.wabaId,
        meta_id: created.id,
        name: request.name,
        language: request.language,
        category: created.category || request.category,
        status: created.status || "PENDING",
        components: request.components,
        parameter_format: (request as any).parameter_format || null,
        rejected_reason: null,
        updated_at: new Date().toISOString()
      }, { onConflict: "tenant_id,name,language" }).select("*").single(),
      "save_template"
    )
    await publish(req.auth.tenantId, "template.updated", { name: request.name })
    return res.status(201).send({ template: toTemplateDTO(row) })
  })

  app.delete("/templates/:name", async req => {
    requireAdmin(req)
    const { name } = req.params as { name: string }
    const wa = await requireWhatsApp(req.auth.tenantId)
    try {
      await deleteTemplate(wa.wabaId, wa.token, name)
    } catch (e) {
      // Already gone on Meta's side is fine; anything else is surfaced.
      if (!(e instanceof GraphError && e.status === 404)) graphFailure(e)
    }
    must(await supabaseAdmin().from("templates").delete().eq("tenant_id", req.auth.tenantId).eq("name", name), "delete_template")
    await publish(req.auth.tenantId, "template.updated", { name })
    return { success: true }
  })
}
