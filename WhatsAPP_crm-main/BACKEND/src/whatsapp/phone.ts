/**
 * Normalizes a phone number into a WhatsApp id: digits only, with country code, no "+".
 * Returns null when the input cannot be an international number (E.164 allows 8–15 digits).
 */
export function normalizeWaId(input: unknown): string | null {
  if (input === null || input === undefined) return null
  let s = String(input).trim()
  if (!s) return null
  if (s.startsWith("00")) s = s.slice(2)
  const digits = s.replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 15) return null
  if (digits.startsWith("0")) return null
  return digits
}

export function toE164(waId: string): string {
  return `+${waId}`
}
