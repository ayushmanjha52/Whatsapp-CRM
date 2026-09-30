/** Flattens a WhatsApp Cloud API webhook body into the events we act on. Pure: no I/O. */

export type InboundMessageEvent = {
  kind: "message"
  phoneNumberId: string
  wabaId?: string
  waId: string
  profileName?: string
  message: any
  timestampMs: number
  conversationId?: string
}

export type StatusEvent = {
  kind: "status"
  phoneNumberId: string
  wabaId?: string
  wamid: string
  status: "sent" | "delivered" | "read" | "failed" | string
  recipientId?: string
  timestampMs: number
  error?: { code?: number; title?: string; message?: string; details?: string }
}

export type TemplateStatusEvent = {
  kind: "template_status"
  wabaId: string
  event: string
  templateId?: string
  name?: string
  language?: string
  reason?: string
}

export type WebhookEvent = InboundMessageEvent | StatusEvent | TemplateStatusEvent

function tsMs(ts: unknown): number {
  const n = Number(ts)
  return Number.isFinite(n) && n > 0 ? n * 1000 : Date.now()
}

export function normalizeWebhook(body: any): WebhookEvent[] {
  const events: WebhookEvent[] = []
  if (!body || body.object !== "whatsapp_business_account") return events
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    const wabaId = entry?.id ? String(entry.id) : undefined
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {}
      if (change?.field === "message_template_status_update") {
        if (wabaId) {
          events.push({
            kind: "template_status",
            wabaId,
            event: String(value.event || ""),
            templateId: value.message_template_id ? String(value.message_template_id) : undefined,
            name: value.message_template_name,
            language: value.message_template_language,
            reason: value.reason && value.reason !== "NONE" ? value.reason : undefined
          })
        }
        continue
      }
      if (change?.field !== "messages") continue
      const phoneNumberId = String(value.metadata?.phone_number_id || "")
      const names = new Map<string, string>()
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        if (c?.wa_id) names.set(String(c.wa_id), c.profile?.name)
      }
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        if (!m?.id || !m?.from) continue
        const waId = String(m.from)
        events.push({
          kind: "message",
          phoneNumberId,
          wabaId,
          waId,
          profileName: names.get(waId),
          message: m,
          timestampMs: tsMs(m.timestamp),
          conversationId: value.conversation?.id
        })
      }
      for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!st?.id || !st?.status) continue
        const err = Array.isArray(st.errors) ? st.errors[0] : undefined
        events.push({
          kind: "status",
          phoneNumberId,
          wabaId,
          wamid: String(st.id),
          status: String(st.status),
          recipientId: st.recipient_id ? String(st.recipient_id) : undefined,
          timestampMs: tsMs(st.timestamp),
          error: err ? { code: err.code, title: err.title, message: err.message, details: err.error_data?.details } : undefined
        })
      }
    }
  }
  return events
}

export const MEDIA_KINDS = ["image", "video", "audio", "document", "sticker"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export function mediaOf(message: any): { kind: MediaKind; id: string } | null {
  for (const kind of MEDIA_KINDS) {
    const id = message?.[kind]?.id
    if (id) return { kind, id: String(id) }
  }
  return null
}
