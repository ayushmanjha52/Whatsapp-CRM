import { supabaseAdmin } from "../src/common/db"

async function main() {
  const s = supabaseAdmin()
  const list = await (s as any).storage.listBuckets?.()
  console.log("listBuckets", list?.data || list)
  const res = await s.storage.createBucket("media", { public: true })
  console.log("createBucket", res.error || res.data || res)
}

main().catch(e => { console.error(e); process.exit(1) })
