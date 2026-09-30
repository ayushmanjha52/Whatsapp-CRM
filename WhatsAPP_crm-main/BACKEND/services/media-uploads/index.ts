import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { worker } from "../../src/common/queue"
import { assertEnv, env, Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import { publish } from "../../src/common/realtime"
import { ensureMediaBucket, extFromContentType } from "../../src/common/storage"
import { getTenantWhatsApp } from "../../src/whatsapp/credentials"
import { getMediaUrl } from "../../src/whatsapp/graph"
import { toMessageDTO } from "../../src/whatsapp/messages"

type JobData = {
  tenant_id: string
  wa_id: string
  phone_number_id?: string
  media_id?: string
  msg_id?: string
  kind?: "image" | "video" | "audio" | "document" | "sticker"
}

/** Streams a download to a temp file, hashing as it goes, so large videos never sit in memory. */
async function downloadToTemp(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok || !res.body) throw new Error(`download_failed_${res.status}`)
  const contentType = res.headers.get("content-type") || "application/octet-stream"
  const file = path.join(os.tmpdir(), `wa_${crypto.randomUUID()}.bin`)
  const out = fs.createWriteStream(file)
  const hash = crypto.createHash("sha256")
  let size = 0
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      hash.update(value)
      if (!out.write(Buffer.from(value))) await new Promise<void>(r => out.once("drain", () => r()))
    }
  } finally {
    await new Promise<void>(r => out.end(() => r()))
  }
  return { file, contentType, size, sha256: hash.digest("hex") }
}

async function storeMessageMedia(job: JobData) {
  if (!job.media_id || !job.msg_id) return
  const wa = await getTenantWhatsApp(job.tenant_id, job.phone_number_id)
  if (!wa) throw new Error("whatsapp_not_connected")
  await ensureMediaBucket()
  const s = supabaseAdmin()
  const meta = await getMediaUrl(job.media_id, wa.token)
  const tmp = await downloadToTemp(meta.url, wa.token)
  try {
    const contentType = (meta.mime_type || tmp.contentType).split(";")[0]!
    const objectPath = `tenant/${job.tenant_id}/messages/${job.media_id}.${extFromContentType(contentType)}`
    const up = await s.storage.from(env.MEDIA_BUCKET).upload(objectPath, await fs.promises.readFile(tmp.file), { contentType, upsert: true })
    if (up.error) throw new Error(`upload_failed: ${up.error.message}`)
    const storedUrl = s.storage.from(env.MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl

    const { data: row } = await s.from("messages").select("*").eq("tenant_id", job.tenant_id).eq("id", job.msg_id).maybeSingle()
    if (!row) return
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json || {}
    const kind = job.kind || "image"
    payload[kind] = { ...(payload[kind] || {}), stored_url: storedUrl, mime_type: payload[kind]?.mime_type || contentType }
    const { data: updated, error } = await s
      .from("messages")
      .update({ payload_json: payload, has_media: true })
      .eq("tenant_id", job.tenant_id)
      .eq("id", job.msg_id)
      .select("*")
      .single()
    if (error) throw new Error(`message_update_failed: ${error.message}`)

    await s.from("message_media").insert({
      tenant_id: job.tenant_id,
      message_id: job.msg_id,
      kind,
      bucket_path: objectPath,
      stored_url: storedUrl,
      content_type: contentType,
      size: tmp.size,
      sha256: tmp.sha256
    })
    await publish(job.tenant_id, "message.updated", { wa_id: job.wa_id, message: toMessageDTO(updated) })
    console.log(JSON.stringify({ event: "media_stored", tenant_id: job.tenant_id, msg_id: job.msg_id, kind, size: tmp.size }))
  } finally {
    await fs.promises.unlink(tmp.file).catch(() => {})
  }
}

if (import.meta.main) {
  assertEnv("media-uploads", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "DATA_ENCRYPTION_KEY"])
  worker(Queues.MediaUploads, async job => {
    const data = job.data as JobData
    if (!data?.tenant_id || !data.wa_id) return
    if (job.name === "message-media" || data.media_id) await storeMessageMedia(data)
  }, { concurrency: Number(process.env.WORKER_CONCURRENCY_MEDIA || 5) })
  console.log(JSON.stringify({ event: "worker_started", queue: Queues.MediaUploads }))
}
