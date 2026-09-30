import crypto from "crypto"
import { supabaseAdmin } from "../common/db"
import { queue } from "../common/queue"
import { Queues } from "../common/config"
import { publish } from "../common/realtime"
import { previewOf, toMessageDTO, type MessageDTO } from "../whatsapp/messages"

export type OutboundJob = {
  tenant_id: string
  message_id: string
  to: string
  phone_number_id?: string
}

/**
 * Records an outbound message as "queued" (so it shows in the chat immediately) and
 * hands it to the messaging worker. The worker updates the status as WhatsApp reports it.
 */
export async function queueOutboundMessage(opts: {
  tenantId: string
  contactId: number
  waId: string
  payload: Record<string, any>
  sentBy?: string
  phoneNumberId?: string
}): Promise<MessageDTO> {
  const s = supabaseAdmin()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const type = String(opts.payload.type || "text")
  const { data: row, error } = await s
    .from("messages")
    .insert({
      id,
      tenant_id: opts.tenantId,
      thread_id: opts.waId,
      direction: "out",
      type,
      payload_json: opts.payload,
      status: "queued",
      sent_by: opts.sentBy ?? null,
      created_at: now
    })
    .select("*")
    .single()
  if (error) throw new Error(`message_insert_failed: ${error.message}`)

  await s
    .from("contacts")
    .update({
      last_message_at: now,
      last_message_preview: previewOf(type, opts.payload),
      last_message_direction: "out",
      in_inbox: true,
      unread_count: 0,
      updated_at: now
    })
    .eq("id", opts.contactId)

  const job: OutboundJob = { tenant_id: opts.tenantId, message_id: id, to: opts.waId, phone_number_id: opts.phoneNumberId }
  await queue(Queues.OutboundMessages).add("send", job, { jobId: id })

  const dto = toMessageDTO(row)
  await publish(opts.tenantId, "message.created", { wa_id: opts.waId, message: dto })
  await publish(opts.tenantId, "conversation.updated", { wa_id: opts.waId })
  return dto
}
