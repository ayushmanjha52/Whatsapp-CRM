import { processProfileImageJob } from "../services/media-uploads/index.ts"
import { supabaseAdmin } from "../src/common/db"

async function main() {
  const tenantId = process.env.TEST_TENANT_ID || "test-tenant"
  const waId = process.env.TEST_WA_ID || "16505551234"
  const url = process.env.TEST_IMAGE_URL || "https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png"
  const s = supabaseAdmin()
  await s.from("contacts").upsert({ tenant_id: tenantId, wa_id: waId, origin: "inbox", display_name: "Test" }, { onConflict: "tenant_id,wa_id" })
  await processProfileImageJob({ tenant_id: tenantId, wa_id: waId, url })
  const { data } = await s.from("contacts").select("profile_image_url,profile_image_hash").eq("tenant_id", tenantId).eq("wa_id", waId).limit(1)
  console.log(JSON.stringify({ contact: data && data[0] }))
}

main().catch(e => { console.error(e); process.exit(1) })

