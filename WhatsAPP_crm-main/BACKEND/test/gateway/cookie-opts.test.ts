import { describe, it, expect } from "bun:test"

function opts() {
  return { httpOnly: true, secure: true, sameSite: "strict", path: "/" }
}

describe("cookie options", () => {
  it("enforces secure flags", () => {
    const o = opts()
    expect(o.httpOnly).toBe(true)
    expect(o.secure).toBe(true)
    expect(o.sameSite).toBe("strict")
    expect(o.path).toBe("/")
  })
})

