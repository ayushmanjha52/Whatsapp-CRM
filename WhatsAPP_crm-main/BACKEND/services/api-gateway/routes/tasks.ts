import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { supabaseAdmin, must } from "../../../src/common/db"
import { queue } from "../../../src/common/queue"
import { Queues } from "../../../src/common/config"
import { publish } from "../../../src/common/realtime"
import { notFound, parse } from "../../../src/http/errors"

const TASK_SELECT = "id,title,due_at,completed_at,created_at,contacts(wa_id,display_name,phone_e164)"

function toTaskDTO(row: any) {
  return {
    id: row.id,
    title: row.title,
    due_at: row.due_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    contact: row.contacts
      ? { wa_id: row.contacts.wa_id, name: row.contacts.display_name || row.contacts.phone_e164 || `+${row.contacts.wa_id}` }
      : null
  }
}

async function scheduleReminder(taskId: number, dueAt: string) {
  const delay = new Date(dueAt).getTime() - Date.now()
  if (delay < 0) return
  await queue(Queues.Reminders).add("task-due", { task_id: taskId, due_at: dueAt }, {
    jobId: `task-${taskId}-${new Date(dueAt).getTime()}`,
    delay,
    attempts: 3
  })
}

export default async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", async req => {
    const q = parse(z.object({
      status: z.enum(["open", "done", "all"]).default("open"),
      wa_id: z.string().optional(),
      due_before: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }), req.query)
    const s = supabaseAdmin()
    let query = s.from("tasks").select(TASK_SELECT).eq("tenant_id", req.auth.tenantId)
    if (q.status === "open") query = query.is("completed_at", null)
    if (q.status === "done") query = query.not("completed_at", "is", null)
    if (q.due_before) query = query.lt("due_at", q.due_before)
    if (q.wa_id) {
      const { data: c } = await s.from("contacts").select("id").eq("tenant_id", req.auth.tenantId).eq("wa_id", q.wa_id).maybeSingle()
      if (!c) return { tasks: [] }
      query = query.eq("contact_id", c.id)
    }
    const rows = must(await query.order("due_at", { ascending: q.status !== "done" }).limit(q.limit), "list_tasks") as any[]
    return { tasks: rows.map(toTaskDTO) }
  })

  app.post("/tasks", async (req, res) => {
    const body = parse(z.object({
      title: z.string().trim().min(1).max(500),
      due_at: z.string().datetime({ offset: true }),
      wa_id: z.string().optional()
    }), req.body)
    const s = supabaseAdmin()
    let contactId: number | null = null
    if (body.wa_id) {
      const { data: c } = await s.from("contacts").select("id").eq("tenant_id", req.auth.tenantId).eq("wa_id", body.wa_id).maybeSingle()
      if (!c) throw notFound("contact_not_found")
      contactId = c.id
    }
    const row = must(
      await s.from("tasks").insert({
        tenant_id: req.auth.tenantId,
        contact_id: contactId,
        title: body.title,
        due_at: body.due_at,
        created_by: req.auth.userId
      }).select(TASK_SELECT).single(),
      "create_task"
    )
    await scheduleReminder(row.id, row.due_at)
    await publish(req.auth.tenantId, "task.updated", { task_id: row.id })
    return res.status(201).send({ task: toTaskDTO(row) })
  })

  app.patch("/tasks/:id", async req => {
    const id = Number((req.params as any).id)
    const body = parse(z.object({
      title: z.string().trim().min(1).max(500).optional(),
      due_at: z.string().datetime({ offset: true }).optional(),
      completed: z.boolean().optional()
    }), req.body)
    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) patch.title = body.title
    if (body.due_at !== undefined) patch.due_at = body.due_at
    if (body.completed !== undefined) patch.completed_at = body.completed ? new Date().toISOString() : null
    const rows = must(
      await supabaseAdmin().from("tasks").update(patch).eq("tenant_id", req.auth.tenantId).eq("id", id).select(TASK_SELECT),
      "update_task"
    ) as any[]
    if (rows.length === 0) throw notFound("task_not_found")
    if (body.due_at) await scheduleReminder(id, rows[0].due_at)
    await publish(req.auth.tenantId, "task.updated", { task_id: id })
    return { task: toTaskDTO(rows[0]) }
  })

  app.delete("/tasks/:id", async req => {
    const id = Number((req.params as any).id)
    must(await supabaseAdmin().from("tasks").delete().eq("tenant_id", req.auth.tenantId).eq("id", id), "delete_task")
    await publish(req.auth.tenantId, "task.updated", { task_id: id, deleted: true })
    return { success: true }
  })
}
