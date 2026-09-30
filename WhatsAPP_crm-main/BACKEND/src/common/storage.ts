import { supabaseAdmin } from "./db"
import { env } from "./config"

let ensured = false

/**
 * Makes sure the public media bucket exists. WhatsApp downloads outbound media from
 * these public URLs, so the bucket must be public and accept every WhatsApp media type.
 */
export async function ensureMediaBucket() {
  if (ensured) return
  const s = supabaseAdmin()
  const { data: buckets } = await s.storage.listBuckets()
  const bucket = (buckets || []).find(b => b.name === env.MEDIA_BUCKET)
  if (!bucket) {
    const { error } = await s.storage.createBucket(env.MEDIA_BUCKET, { public: true, fileSizeLimit: "100MB" })
    if (error && !/already exists/i.test(error.message)) throw new Error(`bucket_create_failed: ${error.message}`)
  } else if ((bucket as any).allowed_mime_types?.length) {
    await s.storage.updateBucket(env.MEDIA_BUCKET, { public: true, fileSizeLimit: "100MB", allowedMimeTypes: null as any })
  }
  ensured = true
}

export function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/aac": "aac", "audio/mp4": "m4a", "audio/amr": "amr",
    "application/pdf": "pdf", "text/plain": "txt",
    "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
  }
  const base = ct.split(";")[0]!.trim().toLowerCase()
  return map[base] || base.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin"
}
