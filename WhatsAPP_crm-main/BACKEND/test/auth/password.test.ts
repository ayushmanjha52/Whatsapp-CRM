import { describe, it, expect } from "bun:test"
import { hashPassword, verifyPassword } from "../../src/auth/password"

describe("password", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("StrongPass123!")
    const ok = await verifyPassword("StrongPass123!", h)
    expect(ok).toBe(true)
  })
})

