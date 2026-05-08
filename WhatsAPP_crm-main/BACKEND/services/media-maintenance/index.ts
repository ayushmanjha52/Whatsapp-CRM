import { worker, redis } from "../../src/common/queue"
import { Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"

async function checkTenant(tenantId: string) {
  const s = supabaseAdmin()
  const { data } = await s.from("message_media").select("id,bucket_path,kind,message_id").eq("tenant_id", tenantId).limit(1000)
  for (const row of data || []) {
    try {
      const path = (row as any).bucket_path
      const r = await s.storage.from("media").list(path.split("/").slice(0, -1).join("/"))
      if ((r as any).error) continue
    } catch {}
  }
}

worker(Queues.AnalyticsSnapshots, async job => {
  const tenantId = (job.data || {}).tenant_id as string
  if (tenantId) await checkTenant(tenantId)
}, { concurrency: Number(process.env.WORKER_CONCURRENCY_MAINT || 2) })

