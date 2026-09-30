import type { FastifyInstance } from "fastify"
import crypto from "crypto"
import { supabaseAdmin } from "../../../src/common/db"
import { env } from "../../../src/common/config"
import { ensureMediaBucket, extFromContentType } from "../../../src/common/storage"
import { badRequest } from "../../../src/http/errors"

// https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#supported-media-types
const RULES: { kind: "image" | "video" | "audio" | "document"; test: (mime: string) => boolean; maxMb: number }[] = [
  { kind: "image", test: m => m === "image/jpeg" || m === "image/png", maxMb: 5 },
  { kind: "video", test: m => m === "video/mp4" || m === "video/3gpp", maxMb: 16 },
  { kind: "audio", test: m => ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"].includes(m), maxMb: 16 },
  { kind: "document", test: () => true, maxMb: 100 }
]

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export default async function mediaRoutes(app: FastifyInstance) {
  /** Uploads a file for sending; returns a public URL WhatsApp can fetch. */
  app.post("/media", async (req, res) => {
    const file = await (req as any).file()
    if (!file) throw badRequest("file_required")
    const buf: Buffer = await file.toBuffer()
    if (file.file?.truncated) throw badRequest("file_too_large", "Files can be at most 100 MB")
    const mime = String(file.mimetype || "application/octet-stream").split(";")[0]!.toLowerCase()
    const rule = RULES.find(r => r.test(mime))!
    if (buf.length > rule.maxMb * 1024 * 1024) {
      throw badRequest("file_too_large", `WhatsApp allows ${rule.kind} files up to ${rule.maxMb} MB`)
    }
    await ensureMediaBucket()
    const path = `tenant/${req.auth.tenantId}/outbound/${crypto.randomUUID()}.${extFromContentType(mime)}`
    const s = supabaseAdmin()
    const up = await s.storage.from(env.MEDIA_BUCKET).upload(path, buf, { contentType: mime, upsert: false })
    if (up.error) throw new Error(`upload_failed: ${up.error.message}`)
    const url = s.storage.from(env.MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    return res.status(201).send({ url, kind: rule.kind, mime_type: mime, filename: file.filename, size: buf.length })
  })
}
