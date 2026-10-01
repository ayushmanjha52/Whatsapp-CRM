import { worker } from "../../src/common/queue"
import { assertEnv, Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import { publish } from "../../src/common/realtime"
import { checkCampaignCompletion, dispatchCampaign, scheduleCompletionCheck } from "../../src/crm/campaigns"

async function taskDue(taskId: number, dueAt: string) {
  const { data: task } = await supabaseAdmin()
    .from("tasks")
    .select("id,tenant_id,title,due_at,completed_at,contacts(wa_id,display_name,phone_e164)")
    .eq("id", taskId)
    .maybeSingle()
  // Skip reminders for tasks completed, deleted or rescheduled since the job was queued.
  if (!task || task.completed_at || new Date(task.due_at).getTime() !== new Date(dueAt).getTime()) return
  const c: any = task.contacts
  await publish(task.tenant_id, "task.due", {
    task: {
      id: task.id,
      title: task.title,
      due_at: task.due_at,
      contact: c ? { wa_id: c.wa_id, name: c.display_name || c.phone_e164 } : null
    }
  })
}

export function startCampaignWorker() {
  assertEnv("campaign-worker", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"])

  worker(Queues.CampaignDispatch, async job => {
    const id = Number(job.data?.campaign_id)
    if (!id) return
    if (job.name === "dispatch") return dispatchCampaign(id)
    if (job.name === "check") {
      const finished = await checkCampaignCompletion(job.data.tenant_id, id)
      if (!finished) await scheduleCompletionCheck(job.data.tenant_id, id)
    }
  }, { concurrency: Number(process.env.WORKER_CONCURRENCY_CAMPAIGN || 2) })

  worker(Queues.Reminders, async job => {
    if (job.name === "task-due") await taskDue(Number(job.data.task_id), job.data.due_at)
  }, { concurrency: 5 })

  console.log(JSON.stringify({ event: "worker_started", queues: [Queues.CampaignDispatch, Queues.Reminders] }))
}

if (import.meta.main) startCampaignWorker()
