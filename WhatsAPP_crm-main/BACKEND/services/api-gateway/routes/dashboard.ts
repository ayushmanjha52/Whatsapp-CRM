import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { parse } from "../../../src/http/errors"
import { CONTACT_SELECT, toContactDTO } from "../../../src/crm/contacts"
import { ensureStages } from "./pipeline"

function validTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

function endOfTodayIso(tz: string): string {
  // The end of "today" in the viewer's zone, expressed as an absolute instant.
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || 0)
  const elapsed = ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000
  return new Date(now.getTime() - elapsed + 24 * 3600 * 1000).toISOString()
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async req => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(7), tz: z.string().max(64).optional() }), req.query)
    const tz = validTimeZone(q.tz)
    const tenantId = req.auth.tenantId
    const s = supabaseAdmin()
    await ensureStages(tenantId)
    const since = new Date(Date.now() - (q.days - 1) * 24 * 3600 * 1000)
    since.setUTCHours(0, 0, 0, 0)

    const [stats, priority, tasks, campaigns] = await Promise.all([
      s.rpc("crm_dashboard", { p_tenant: tenantId, p_since: since.toISOString(), p_tz: tz }),
      s.from("contacts").select(CONTACT_SELECT).eq("tenant_id", tenantId).eq("in_inbox", true).eq("archived", false)
        .not("last_message_at", "is", null)
        .order("unread_count", { ascending: false })
        .order("last_message_at", { ascending: false })
        .limit(6),
      s.from("tasks").select("id,title,due_at,completed_at,contacts(wa_id,display_name,phone_e164)")
        .eq("tenant_id", tenantId).is("completed_at", null).lt("due_at", endOfTodayIso(tz))
        .order("due_at").limit(10),
      s.from("campaigns").select("id,name,status,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(3)
    ])

    return {
      range: { days: q.days, since: since.toISOString(), tz },
      ...(must(stats, "dashboard_stats") as any),
      priority_inbox: (must(priority, "priority_inbox") as any[]).map(toContactDTO),
      tasks_today: (must(tasks, "tasks_today") as any[]).map(t => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at,
        contact: t.contacts ? { wa_id: t.contacts.wa_id, name: t.contacts.display_name || t.contacts.phone_e164 } : null
      })),
      recent_campaigns: must(campaigns, "recent_campaigns")
    }
  })
}
