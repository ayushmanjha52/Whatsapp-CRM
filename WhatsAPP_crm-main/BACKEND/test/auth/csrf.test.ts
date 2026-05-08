import { describe, it, expect } from "bun:test"
import { generateCsrfToken, verifyCsrfToken } from "../../src/auth/csrf"

describe("csrf", () => {
  it("double submit validation", () => {
    const t = generateCsrfToken()
    expect(verifyCsrfToken(t, t)).toBe(true)
    expect(verifyCsrfToken(t, "wrong")).toBe(false)
  })
})

