import { supabaseAdmin } from "../common/db"
import { decryptText } from "../security/crypto"

export type TenantWhatsApp = {
  tenantId: string
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber?: string
  verifiedName?: string
  token: string
}

/**
 * Resolves the sender for a tenant: the requested phone number if the tenant owns it,
 * otherwise the default sender, otherwise any connected number.
 */
export async function getTenantWhatsApp(tenantId: string, phoneNumberId?: string): Promise<TenantWhatsApp | null> {
  const s = supabaseAdmin()
  const { data, error } = await s
    .from("whatsapp_credentials")
    .select("waba_id,phone_number_id,display_phone_number,verified_name,access_token_encrypted,default_sender")
    .eq("tenant_id", tenantId)
  if (error) throw new Error(`credentials_lookup_failed: ${error.message}`)
  const rows = (data || []).filter((r: any) => r.access_token_encrypted)
  const row =
    (phoneNumberId && rows.find((r: any) => r.phone_number_id === phoneNumberId)) ||
    rows.find((r: any) => r.default_sender) ||
    rows[0]
  if (!row) return null
  return {
    tenantId,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    verifiedName: row.verified_name,
    token: decryptText(row.access_token_encrypted)
  }
}

export async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null
  const { data } = await supabaseAdmin()
    .from("whatsapp_credentials")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
  return data?.[0]?.tenant_id ?? null
}

export async function resolveTenantByWabaId(wabaId: string): Promise<string | null> {
  if (!wabaId) return null
  const { data } = await supabaseAdmin()
    .from("whatsapp_credentials")
    .select("tenant_id")
    .eq("waba_id", wabaId)
    .limit(1)
  return data?.[0]?.tenant_id ?? null
}
