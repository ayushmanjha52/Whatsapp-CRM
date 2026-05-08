import { worker, redis } from "../../src/common/queue"
import { Queues } from "../../src/common/config"
import { supabaseAdmin } from "../../src/common/db"
import crypto from "crypto"
import fs from "fs"
import os from "os"

function dbg(event: string, data: any = {}) {
  if (process.env.DEBUG_MEDIA_WORKER === "1") {
    try { console.log(JSON.stringify({ event, ...data })) } catch {}
  }
}

type JobData = {
  tenant_id: string
  wa_id: string
  phone_number_id?: string
  url?: string
  media_id?: string
  msg_id?: string
  kind?: "image" | "video" | "audio" | "document" | "sticker"
}

async function ensureBucket() {
  const s = supabaseAdmin()
  try {
    const list = await (s as any).storage.listBuckets?.()
    dbg("storage_list_buckets", { ok: !!list, count: Array.isArray(list?.data) ? list.data.length : undefined })
    const exists = Array.isArray(list?.data) ? list.data.some((b: any) => b.name === "media") : false
    if (!exists) {
      const res = await s.storage.createBucket("media", { public: true, fileSizeLimit: "50MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "audio/mpeg", "audio/ogg", "application/pdf"] })
      if (res.error) {
        console.error("storage_create_bucket_error", res.error)
        throw res.error
      }
      console.log("storage_bucket_created", { bucket: "media" })
    }
  } catch (e: any) {
    console.error("storage_bucket_check_failed", { message: e?.message })
  }
}

async function download(url: string, token?: string): Promise<{ bytes: Uint8Array, contentType: string, etag?: string }> {
  dbg("download_start", { url })
  let r = await fetch(url)
  if (!r.ok && token) r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`download_failed_${r.status}`)
  const ct = r.headers.get("content-type") || "image/jpeg"
  const etag = r.headers.get("etag") || undefined
  const ab = await r.arrayBuffer()
  dbg("download_ok", { contentType: ct, size: (ab as any)?.byteLength })
  return { bytes: new Uint8Array(ab), contentType: ct, etag }
}

async function downloadToTempFile(url: string, token?: string): Promise<{ filePath: string, contentType: string, size: number, sha: string, etag?: string }> {
  dbg("download_stream_start", { url })
  let r = await fetch(url)
  if (!r.ok && token) r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`download_failed_${r.status}`)
  const ct = r.headers.get("content-type") || "image/jpeg"
  const etag = r.headers.get("etag") || undefined
  const tmp = `${os.tmpdir()}/wa_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`
  const ws = fs.createWriteStream(tmp)
  const h = crypto.createHash("sha256")
  let size = 0
  const reader: any = (r as any).body?.getReader ? (r as any).body.getReader() : null
  if (reader) {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      const chunk: Uint8Array = part.value
      size += chunk.byteLength
      h.update(chunk)
      if (!ws.write(Buffer.from(chunk))) await new Promise(res => ws.once("drain", res))
    }
    await new Promise(res => ws.end(res))
  } else {
    const ab = await r.arrayBuffer()
    const bytes = new Uint8Array(ab)
    size = bytes.byteLength
    h.update(bytes)
    ws.write(Buffer.from(bytes))
    await new Promise(res => ws.end(res))
  }
  const sha = h.digest("hex")
  dbg("download_stream_ok", { contentType: ct, size })
  return { filePath: tmp, contentType: ct, size, sha, etag }
}

async function uploadFileStreaming(s: any, bucket: string, path: string, filePath: string, contentType: string) {
  const signed = await s.storage.from(bucket).createSignedUploadUrl(path)
  const hasSigned = !(signed as any).error && !!(signed as any).data?.signedUrl && !!(signed as any).data?.token
  const buf = await fs.promises.readFile(filePath)
  if (!hasSigned) {
    return await s.storage.from(bucket).upload(path, buf, { contentType, upsert: true })
  }
  const token = (signed as any).data.token
  const up = await s.storage.from(bucket).uploadToSignedUrl(path, token, buf, { contentType, upsert: true })
  return up
}

function sha256Hex(bytes: Uint8Array): string {
  const h = crypto.createHash("sha256").update(bytes).digest("hex")
  return h
}

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png"
  if (ct.includes("webp")) return "webp"
  if (ct.includes("gif")) return "gif"
  if (ct.includes("mp4")) return "mp4"
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3"
  if (ct.includes("ogg")) return "ogg"
  if (ct.includes("pdf")) return "pdf"
  return "jpg"
}

async function storeProfileImage(job: JobData) {
  await ensureBucket()
  const s = supabaseAdmin()
  const r = redis()
  const memoKey = `profile:seen:${job.tenant_id}:${job.wa_id}`
  const last = await r.get(memoKey)
  if (last === job.url) return
  let dl: { bytes: Uint8Array, contentType: string, etag?: string }
  try {
    const token = await resolveTenantToken(job.tenant_id, job.phone_number_id)
    dbg("token_resolved", { tenant_id: job.tenant_id, hasToken: !!token })
    dl = await download(job.url!, token)
  } catch (e: any) {
    console.error("avatar_download_failed", { wa_id: job.wa_id, tenant_id: job.tenant_id, message: e?.message })
    throw e
  }
  const hash = sha256Hex(dl.bytes)
  const { data: existing } = await s.from("contacts").select("profile_image_hash").eq("tenant_id", job.tenant_id).eq("wa_id", job.wa_id).limit(1)
  const prev = existing && existing[0] ? (existing[0] as any).profile_image_hash : null
  if (prev && prev === hash) {
    await r.set(memoKey, job.url)
    await r.expire(memoKey, 86400)
    return
  }
  const ext = extFromContentType(dl.contentType)
  const path = `tenant/${job.tenant_id}/contacts/${job.wa_id}.${ext}`
  const up = await s.storage.from("media").upload(path, dl.bytes.buffer, { contentType: dl.contentType, upsert: true })
  if (up.error) throw new Error("upload_failed")
  const pub = s.storage.from("media").getPublicUrl(path)
  const url = pub.data.publicUrl
  dbg("avatar_uploaded", { path, url })
  await s.from("contacts").upsert({ tenant_id: job.tenant_id, wa_id: job.wa_id, origin: "inbox", profile_image_url: url, profile_image_hash: hash, last_profile_image_at: new Date().toISOString() }, { onConflict: "tenant_id,wa_id" })
  await r.set(memoKey, job.url)
  await r.expire(memoKey, 86400)
  try { await r.publish(`tenant:${job.tenant_id}:inbox`, JSON.stringify({ event: "contact_avatar_updated", wa_id: job.wa_id, url })) } catch {}
}

export async function processProfileImageJob(data: JobData) {
  await storeProfileImage(data)
}

async function resolveTenantToken(tenantId: string, preferredPhoneNumberId?: string) {
  const s = supabaseAdmin()
  let tokenEnc = ""
  if (preferredPhoneNumberId) {
    const { data } = await s.from("whatsapp_credentials").select("access_token_encrypted").eq("tenant_id", tenantId).eq("phone_number_id", preferredPhoneNumberId).limit(1)
    tokenEnc = data && data[0] ? (data[0] as any).access_token_encrypted || "" : ""
  }
  if (!tokenEnc) {
    const { data } = await s.from("whatsapp_credentials").select("access_token_encrypted").eq("tenant_id", tenantId).limit(1)
    tokenEnc = data && data[0] ? (data[0] as any).access_token_encrypted || "" : ""
  }
  if (tokenEnc) {
    try {
      const { decryptText } = await import("../../src/security/crypto")
      return decryptText(tokenEnc)
    } catch (e: any) {
      console.error("token_decrypt_failed", { tenant_id: tenantId, message: e?.message })
    }
  }
  return process.env.WHATSAPP_ACCESS_TOKEN || ""
}

async function fetchMediaUrl(mediaId: string, token: string): Promise<string> {
  const r = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`media_lookup_failed_${r.status}`)
  const j: any = await r.json()
  const u = j.url || ""
  if (!u) throw new Error("media_url_missing")
  dbg("media_url_resolved", { media_id: mediaId, url: u })
  return u
}

async function storeMessageImage(job: JobData) {
  await ensureBucket()
  const s = supabaseAdmin()
  const token = await resolveTenantToken(job.tenant_id, job.phone_number_id)
  const url = job.url || (job.media_id ? await fetchMediaUrl(job.media_id, token) : "")
  if (!url) return
  const tmp = await downloadToTempFile(url, token)
  const ext = extFromContentType(tmp.contentType)
  const sha = tmp.sha
  const base = job.media_id || `${job.msg_id || job.wa_id}-${sha.substring(0,12)}`
  const path = `tenant/${job.tenant_id}/messages/${base}.${ext}`
  const up = await uploadFileStreaming(s, "media", path, tmp.filePath, tmp.contentType)
  if (up.error) throw new Error("upload_failed")
  try { console.log(JSON.stringify({ event: "storage_upload_ok", tenant_id: job.tenant_id, path })) } catch {}
  const pub = s.storage.from("media").getPublicUrl(path)
  const storedUrl = pub.data.publicUrl
  dbg("media_uploaded", { path, url: storedUrl, kind: job.kind })
  if (job.msg_id) {
    let k: string | undefined
    try {
      const { data, error } = await s.from("messages").select("payload_json").eq("tenant_id", job.tenant_id).eq("id", job.msg_id).limit(1)
      if (error) throw error
      const row = data && data[0]
      const payload = row ? (row as any).payload_json : null
      let newPayload: any
      if (payload && typeof payload === "string") {
        try { newPayload = JSON.parse(payload) } catch { newPayload = {} }
      } else {
        newPayload = payload || {}
      }
      k = job.kind || (newPayload.image ? "image" : newPayload.video ? "video" : newPayload.audio ? "audio" : newPayload.document ? "document" : newPayload.sticker ? "sticker" : undefined)
      if (k) newPayload[k] = { ...(newPayload[k] || {}), stored_url: storedUrl }
      else newPayload.stored_url = storedUrl
      const upd = await s.from("messages").update({ payload_json: newPayload, has_media: true }).eq("tenant_id", job.tenant_id).eq("id", job.msg_id)
      if ((upd as any).error) throw (upd as any).error
    } catch (e: any) {
      console.error("message_update_failed", { tenant_id: job.tenant_id, message_id: job.msg_id, message: e?.message })
      try {
        const upd2 = await s.from("messages").update({ has_media: true }).eq("tenant_id", job.tenant_id).eq("id", job.msg_id)
        if ((upd2 as any).error) throw (upd2 as any).error
      } catch (e2: any) {
        console.error("message_update_flag_failed", { tenant_id: job.tenant_id, message_id: job.msg_id, message: e2?.message })
      }
    }
    
    try {
      const size = tmp.size
      const ins = await s.from("message_media").insert({ tenant_id: job.tenant_id, message_id: job.msg_id, kind: k || "image", bucket_path: path, stored_url: storedUrl, content_type: tmp.contentType, size, sha256: sha })
      if ((ins as any).error) throw (ins as any).error
      console.log(JSON.stringify({ event: "message_media_row_inserted", tenant_id: job.tenant_id, message_id: job.msg_id }))
    } catch (e: any) {
      console.error("message_media_write_failed", { tenant_id: job.tenant_id, message_id: job.msg_id, message: e?.message })
    }
  }
  try { await fs.promises.unlink(tmp.filePath) } catch {}
  try { const r = redis(); await r.publish(`tenant:${job.tenant_id}:inbox`, JSON.stringify({ event: "inbound_media_stored", wa_id: job.wa_id, msg_id: job.msg_id, url: storedUrl, kind: job.kind })) } catch {}
}

worker(Queues.MediaUploads, async job => {
  const data = job.data as JobData
  console.log(JSON.stringify({ event: "media_job_received", data }))
  dbg("env_diagnostics", { has_SUPABASE_URL: !!process.env.SUPABASE_URL, has_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE, has_DATA_ENCRYPTION_KEY: !!process.env.DATA_ENCRYPTION_KEY })
  if (!data || !data.tenant_id || !data.wa_id) return
  if (data.url && !data.media_id) {
    await processProfileImageJob(data)
    console.log(JSON.stringify({ event: "avatar_stored", tenant_id: data.tenant_id, wa_id: data.wa_id }))
    return
  }
  await storeMessageImage(data)
  console.log(JSON.stringify({ event: "message_media_stored", tenant_id: data.tenant_id, wa_id: data.wa_id, msg_id: data.msg_id }))
}, { concurrency: Number(process.env.WORKER_CONCURRENCY_MEDIA || 5) })
