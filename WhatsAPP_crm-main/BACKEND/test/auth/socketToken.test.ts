import { describe, it, expect, beforeAll } from "bun:test"
import { signSocketToken, verifySocketToken } from "../../src/http/auth"

const ctx = { userId: "user-1", tenantId: "tenant-1" }

describe("socket token", () => {
  beforeAll(() => {
    process.env.SOCKET_TOKEN_SECRET = "test-secret"
  })

  it("round-trips the user and tenant", () => {
    expect(verifySocketToken(signSocketToken(ctx))).toEqual(ctx)
  })

  it("expires after two minutes", () => {
    const now = Date.now()
    const token = signSocketToken(ctx, now)
    expect(verifySocketToken(token, now + 119_000)).toEqual(ctx)
    expect(verifySocketToken(token, now + 121_000)).toBeNull()
  })

  it("rejects tampered or malformed tokens", () => {
    const [payload, sig] = signSocketToken(ctx).split(".") as [string, string]
    const forged = Buffer.from(JSON.stringify({ sub: "user-2", tid: "tenant-2", exp: 9e9 })).toString("base64url")
    expect(verifySocketToken(`${forged}.${sig}`)).toBeNull()
    expect(verifySocketToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull()
    expect(verifySocketToken(payload)).toBeNull()
    expect(verifySocketToken("")).toBeNull()
  })

  it("rejects tokens signed with another secret", () => {
    const token = signSocketToken(ctx)
    process.env.SOCKET_TOKEN_SECRET = "rotated"
    try {
      expect(verifySocketToken(token)).toBeNull()
    } finally {
      process.env.SOCKET_TOKEN_SECRET = "test-secret"
    }
  })
})
