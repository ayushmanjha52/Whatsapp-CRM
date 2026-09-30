/** Message shaping shared by the API and workers. Pure: no I/O. */

const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Video",
  audio: "🎤 Audio",
  document: "📄 Document",
  sticker: "Sticker"
}

/** Short human-readable preview for conversation lists. */
export function previewOf(type: string, payload: any): string {
  const p = payload || {}
  switch (type) {
    case "text":
      return clip(p.text?.body)
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker": {
      const m = p[type] || {}
      const caption = m.caption || (type === "document" ? m.filename : "")
      return clip(caption ? `${MEDIA_LABEL[type]} · ${caption}` : MEDIA_LABEL[type])
    }
    case "location":
      return clip(`📍 ${p.location?.name || p.location?.address || "Location"}`)
    case "contacts":
      return clip(`👤 ${p.contacts?.[0]?.name?.formatted_name || "Contact card"}`)
    case "interactive": {
      const i = p.interactive || {}
      return clip(i.button_reply?.title || i.list_reply?.title || i.body?.text || "Interactive message")
    }
    case "button":
      return clip(p.button?.text || "Button reply")
    case "reaction":
      return clip(`Reacted ${p.reaction?.emoji || ""}`.trim())
    case "template":
      return clip(p._rendered || `Template: ${p.template?.name || ""}`)
    case "order":
      return "🛒 Order"
    default:
      return "Message"
  }
}

function clip(s: unknown, n = 200): string {
  const str = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""
  return str.length > n ? str.slice(0, n - 1) + "…" : str
}

export type MessageDTO = {
  id: string
  wa_id: string
  direction: "in" | "out"
  type: string
  text: string
  status: string | null
  error: any
  created_at: string
  campaign_id: number | null
  media: { kind: string; url?: string; mime_type?: string; filename?: string; caption?: string } | null
  reply_to: string | null
  payload: any
}

export function toMessageDTO(row: any): MessageDTO {
  const payload = row.payload_json ?? row.payload ?? {}
  const type = row.type || payload.type || "text"
  let media: MessageDTO["media"] = null
  if (["image", "video", "audio", "document", "sticker"].includes(type)) {
    const m = payload[type] || {}
    media = {
      kind: type,
      url: m.stored_url || m.link || undefined,
      mime_type: m.mime_type,
      filename: m.filename,
      caption: m.caption
    }
  }
  let text = ""
  if (type === "text") text = payload.text?.body || ""
  else if (type === "template") text = payload._rendered || previewOf(type, payload)
  else if (media) text = media.caption || ""
  else text = previewOf(type, payload)
  return {
    id: row.id,
    wa_id: row.thread_id,
    direction: row.direction === "out" ? "out" : "in",
    type,
    text,
    status: row.status ?? null,
    error: row.error ?? null,
    created_at: row.created_at,
    campaign_id: row.campaign_id ?? null,
    media,
    reply_to: payload.context?.id ?? null,
    payload
  }
}
