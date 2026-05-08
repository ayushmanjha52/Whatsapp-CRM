import { describe, it, expect } from "bun:test"
import { signAccessToken, verifyAccessToken } from "../../src/auth/jwt"

describe("jwt", () => {
  it("signs and verifies access tokens", () => {
    const t = signAccessToken({ sub: "user-1", email: "a@b.com" })
    const c = verifyAccessToken(t)
    expect(c.sub).toBe("user-1")
    expect(c.email).toBe("a@b.com")
    expect(c.exp).toBeDefined()
  })
})

