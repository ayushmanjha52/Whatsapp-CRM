import { supabaseAdmin } from "../common/db"
import { notFound } from "../http/errors"

export const SERVICE_WINDOW_MS = 24 * 3600 * 1000

export const CONTACT_SELECT =
  "id,wa_id,display_name,phone_e164,email,company,profile_image_url,tags,notes,custom_fields,origin," +
  "in_inbox,archived,unread_count,last_message_at,last_message_preview,last_message_direction," +
  "last_inbound_at,opted_out,created_at,deals(id,value,stage_id,pipeline_stages(name))"

export type ContactDTO = {
  id: number
  wa_id: string
  name: string
  phone: string
  email: string | null
  company: string | null
  avatar_url: string | null
  tags: string[]
  notes: string
  custom_fields: Record<string, unknown>
  origin: string
  in_inbox: boolean
  archived: boolean
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: string | null
  last_inbound_at: string | null
  window_open: boolean
  opted_out: boolean
  created_at: string
  deal: { id: number; value: number; stage_id: number | null; stage_name: string | null } | null
}

/** WhatsApp only allows free-form messages within 24h of the customer's last message. */
export function isWindowOpen(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false
  return now - new Date(lastInboundAt).getTime() < SERVICE_WINDOW_MS
}

export function toContactDTO(row: any): ContactDTO {
  const deal = Array.isArray(row.deals) ? row.deals[0] : row.deals
  return {
    id: row.id,
    wa_id: row.wa_id,
    name: row.display_name || (row.phone_e164 || `+${row.wa_id}`),
    phone: row.phone_e164 || `+${row.wa_id}`,
    email: row.email ?? null,
    company: row.company ?? null,
    avatar_url: row.profile_image_url ?? null,
    tags: row.tags || [],
    notes: row.notes || "",
    custom_fields: row.custom_fields || {},
    origin: row.origin,
    in_inbox: row.in_inbox ?? true,
    archived: row.archived ?? false,
    unread_count: row.unread_count ?? 0,
    last_message_at: row.last_message_at ?? null,
    last_message_preview: row.last_message_preview ?? null,
    last_message_direction: row.last_message_direction ?? null,
    last_inbound_at: row.last_inbound_at ?? null,
    window_open: isWindowOpen(row.last_inbound_at),
    opted_out: row.opted_out ?? false,
    created_at: row.created_at,
    deal: deal
      ? { id: deal.id, value: Number(deal.value || 0), stage_id: deal.stage_id ?? null, stage_name: deal.pipeline_stages?.name ?? null }
      : null
  }
}

export async function getContact(tenantId: string, waId: string): Promise<ContactDTO> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("tenant_id", tenantId)
    .eq("wa_id", waId)
    .maybeSingle()
  if (error) throw new Error(`contact_lookup_failed: ${error.message}`)
  if (!data) throw notFound("contact_not_found", "Contact not found")
  return toContactDTO(data)
}

/** Strips characters that would break a PostgREST `or=(...)` filter or act as wildcards. */
export function sanitizeSearch(q: unknown): string {
  return String(q ?? "").replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) {
    const v = String(t ?? "").trim().slice(0, 40)
    if (!v) continue
    const canonical = v.toLowerCase() === "vip" ? "VIP" : v
    if (!out.some(x => x.toLowerCase() === canonical.toLowerCase())) out.push(canonical)
  }
  return out.slice(0, 30)
}
