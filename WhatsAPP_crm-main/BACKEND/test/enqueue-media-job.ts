import { queue } from "../src/common/queue"
import { Queues } from "../src/common/config"

async function main() {
  const tenantId = process.env.TEST_TENANT_ID || "test-tenant"
  const waId = process.env.TEST_WA_ID || "16505551234"
  const url = process.env.TEST_IMAGE_URL || "https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png"
  const q = queue(Queues.MediaUploads)
  const job = await q.add("profile", { tenant_id: tenantId, wa_id: waId, url })
  console.log(JSON.stringify({ enqueued: true, job_id: job.id }))
}

main().catch(e => { console.error(e); process.exit(1) })

