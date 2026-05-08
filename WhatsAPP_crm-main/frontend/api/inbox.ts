import { apiUrl, EXTRA_HEADERS } from "../config"

export async function getThreads(): Promise<{ threads: Array<{ wa_id: string; display_name?: string; profile_image_url?: string; last_message?: string; last_message_time?: string }> }> {
  const r = await fetch(apiUrl("/inbox/threads"), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
  if (!r.ok) throw new Error("threads_failed")
  return r.json()
}

export async function getMessages(waId: string): Promise<{ messages: any[] }> {
  const u = new URL(apiUrl("/inbox/messages"), window.location.origin)
  u.searchParams.set("wa_id", waId)
  const r = await fetch(u.toString(), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
  if (!r.ok) throw new Error("messages_failed")
  return r.json()
}

export async function getLastOutbound(waId: string): Promise<any> {
  const u = new URL(apiUrl("/messages/last"), window.location.origin)
  u.searchParams.set("wa_id", waId)
  const r = await fetch(u.toString(), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
  if (!r.ok) return {}
  try { return await r.json() } catch { return {} }
}

export async function sendTextMessage(toWaId: string, text: string, phoneNumberId?: string): Promise<any> {
  const body: any = { to: toWaId, payload: { type: "text", text: { body: text } } }
  if (phoneNumberId) body.phone_number_id = phoneNumberId
  const r = await fetch(apiUrl("/messages/send"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error("send_failed")
  return r.json()
}

export async function getDefaultSenderNumberId(): Promise<string | undefined> {
  try {
    const r = await fetch(apiUrl("/api/whatsapp/numbers"), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
    if (!r.ok) return undefined
    const j: any = await r.json()
    const nums: any[] = j.numbers || []
    const def = nums.find((n: any) => n.default_sender)
    return def?.phone_number_id
  } catch { return undefined }
}

export async function getContactDetails(waId: string): Promise<{ wa_id: string; display_name?: string; profile_image_url?: string; tags?: string[]; origin?: string; phone_e164?: string } | null> {
  try {
    const r = await fetch(apiUrl(`/contacts/${encodeURIComponent(waId)}`), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

export async function upsertContact(waId: string, displayName?: string, phoneE164?: string): Promise<boolean> {
  const r = await fetch(apiUrl("/contacts"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify({ wa_id: waId, display_name: displayName, phone_e164: phoneE164 })
  })
  if (!r.ok) return false
  const j: any = await r.json().catch(() => ({}))
  return !!j.success
}

export async function getAllContacts(): Promise<Array<{ wa_id: string; display_name?: string; profile_image_url?: string; tags?: string[]; origin?: string; phone_e164?: string; company?: string }>> {
  const r = await fetch(apiUrl("/contacts"), { method: "GET", credentials: "include", headers: { ...EXTRA_HEADERS } })
  if (!r.ok) return []
  const j: any = await r.json().catch(() => ({ contacts: [] }))
  return j.contacts || []
}

// Delete conversation (soft delete - hides from inbox, keeps messages for history)
export async function deleteConversation(waId: string): Promise<boolean> {
  const r = await fetch(apiUrl(`/conversations/${encodeURIComponent(waId)}`), {
    method: "DELETE",
    credentials: "include",
    headers: { ...EXTRA_HEADERS }
  })
  if (!r.ok) return false
  return true
}

// Restore a hidden conversation
export async function restoreConversation(waId: string): Promise<boolean> {
  const r = await fetch(apiUrl(`/conversations/${encodeURIComponent(waId)}/restore`), {
    method: "POST",
    credentials: "include",
    headers: { ...EXTRA_HEADERS }
  })
  if (!r.ok) return false
  return true
}
