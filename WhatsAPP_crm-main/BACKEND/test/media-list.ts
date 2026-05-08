import { supabaseAdmin } from "../src/common/db"

async function main() {
  const s = supabaseAdmin()
  const tenantId = process.env.TEST_TENANT_ID || "test-tenant"
  const messageId = process.env.TEST_MESSAGE_ID || ""
  if (messageId) {
    const { data } = await s.from("message_media").select("id,kind,bucket_path,stored_url,content_type,size,sha256,created_at").eq("tenant_id", tenantId).eq("message_id", messageId)
    console.log(JSON.stringify({ media: data || [] }))
    return
  }
  const { data } = await s.from("message_media").select("id,kind,bucket_path,stored_url,content_type,size,sha256,created_at,message_id").eq("tenant_id", tenantId).limit(50)
  console.log(JSON.stringify({ media: data || [] }))
}

main().catch(e => { console.error(e); process.exit(1) })

