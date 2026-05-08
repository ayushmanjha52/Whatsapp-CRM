import { describe, it, expect } from "bun:test"
import { z } from "zod"

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8) })

describe("validators", () => {
  it("rejects malformed email", () => {
    const r = signupSchema.safeParse({ email: "bad", password: "Strong123!" })
    expect(r.success).toBe(false)
  })
  it("rejects weak password", () => {
    const r = signupSchema.safeParse({ email: "a@b.com", password: "123" })
    expect(r.success).toBe(false)
  })
})

