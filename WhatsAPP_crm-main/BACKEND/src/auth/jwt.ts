import jwt from "jsonwebtoken"

const SECRET = process.env.JWT_SECRET || "change-me"
const KID = process.env.JWT_KID || "v1"

export type AccessClaims = {
  sub: string
  email: string
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, SECRET, {
    algorithm: "HS512",
    expiresIn: "24h",
    header: { alg: "HS512", kid: KID }
  })
}

export function verifyAccessToken(token: string): AccessClaims & jwt.JwtPayload {
  return jwt.verify(token, SECRET, { algorithms: ["HS512"] }) as any
}

