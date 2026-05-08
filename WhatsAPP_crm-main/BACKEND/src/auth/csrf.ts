import crypto from "crypto"

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex")
}

export function verifyCsrfToken(cookieToken: string | undefined, headerToken: string | undefined) {
  if (!cookieToken || !headerToken) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  } catch {
    return false
  }
}

