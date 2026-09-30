import crypto from "crypto"

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export function isValidSignature(rawBody: Buffer | string | undefined, header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !rawBody || !header) return false
  const received = header.trim().toLowerCase().replace(/^sha256=/, "")
  if (!/^[0-9a-f]{64}$/.test(received)) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest()
  return crypto.timingSafeEqual(expected, Buffer.from(received, "hex"))
}
