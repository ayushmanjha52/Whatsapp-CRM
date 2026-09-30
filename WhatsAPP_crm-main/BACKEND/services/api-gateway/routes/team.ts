import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, conflict, notFound, parse } from "../../../src/http/errors"
import { assertSeatAvailable } from "../../../src/billing/entitlements"

const MEMBER_SELECT = "id,user_id,email,name,role,status,created_at"

async function adminCount(tenantId: string) {
  const { count } = await supabaseAdmin()
    .from("tenant_members")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .eq("status", "active")
  return count ?? 0
}

async function loadMember(tenantId: string, id: number) {
  const { data } = await supabaseAdmin().from("tenant_members").select(MEMBER_SELECT).eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  if (!data) throw notFound("member_not_found")
  return data
}

export default async function teamRoutes(app: FastifyInstance) {
  app.get("/team", async req => {
    const rows = must(
      await supabaseAdmin().from("tenant_members").select(MEMBER_SELECT).eq("tenant_id", req.auth.tenantId).order("created_at"),
      "list_team"
    ) as any[]
    return { members: rows.map(m => ({ ...m, is_you: m.user_id === req.auth.userId })) }
  })

  /** Invites by email. The invite is accepted automatically when that person signs up or logs in. */
  app.post("/team/invite", async (req, res) => {
    requireAdmin(req)
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["admin", "agent"]).default("agent") }), req.body)
    const s = supabaseAdmin()
    const { data: existing } = await s.from("tenant_members").select("id").eq("tenant_id", req.auth.tenantId).ilike("email", body.email).maybeSingle()
    if (existing) throw conflict("already_member", "This person is already on the team")
    await assertSeatAvailable(req.auth.tenantId)
    const row = must(
      await s.from("tenant_members").insert({
        tenant_id: req.auth.tenantId,
        email: body.email,
        role: body.role,
        status: "invited",
        invited_by: req.auth.userId
      }).select(MEMBER_SELECT).single(),
      "invite_member"
    )
    return res.status(201).send({ member: row })
  })

  app.patch("/team/:id", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const body = parse(z.object({ role: z.enum(["admin", "agent"]) }), req.body)
    const member = await loadMember(req.auth.tenantId, id)
    if (member.role === "admin" && body.role === "agent" && member.status === "active" && (await adminCount(req.auth.tenantId)) <= 1) {
      throw badRequest("last_admin", "A workspace needs at least one admin")
    }
    const row = must(
      await supabaseAdmin().from("tenant_members").update({ role: body.role }).eq("id", id).select(MEMBER_SELECT).single(),
      "update_member"
    )
    return { member: row }
  })

  app.delete("/team/:id", async req => {
    requireAdmin(req)
    const id = Number((req.params as any).id)
    const member = await loadMember(req.auth.tenantId, id)
    if (member.user_id === req.auth.userId) throw badRequest("cannot_remove_self", "You cannot remove yourself")
    if (member.user_id === req.auth.tenantId) throw badRequest("cannot_remove_owner", "The workspace owner cannot be removed")
    must(await supabaseAdmin().from("tenant_members").delete().eq("id", id), "remove_member")
    return { success: true }
  })
}
