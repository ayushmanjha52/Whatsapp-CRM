import crypto from "crypto"

function getKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY || ""
  if (!raw) throw new Error("missing_DATA_ENCRYPTION_KEY")
  let buf: Buffer
  if (/^[A-Fa-f0-9]+$/.test(raw) && raw.length === 64) {
    buf = Buffer.from(raw, "hex")
  } else {
    const b64 = Buffer.from(raw, "base64")
    if (b64.length === 32) buf = b64
    else {
      const utf = Buffer.from(raw, "utf8")
      buf = utf
    }
  }
  if (buf.length !== 32) throw new Error("invalid_DATA_ENCRYPTION_KEY_length")
  return buf
}

export function encryptText(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptText(encoded: string): string {
  const key = getKey()
  const buf = Buffer.from(encoded, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString("utf8")
}
