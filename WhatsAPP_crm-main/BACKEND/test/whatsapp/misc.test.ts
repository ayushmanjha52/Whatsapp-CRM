import { describe, it, expect } from "bun:test"
import crypto from "crypto"
import { previewOf, toMessageDTO } from "../../src/whatsapp/messages"
import { normalizeWaId } from "../../src/whatsapp/phone"
import { isValidSignature } from "../../src/whatsapp/signature"
import { GraphError } from "../../src/whatsapp/graph"
import { isWindowOpen, normalizeTags, sanitizeSearch, toContactDTO } from "../../src/crm/contacts"

describe("previewOf", () => {
  it("summarizes each message type", () => {
    expect(previewOf("text", { text: { body: "  hello\n world " } })).toBe("hello world")
    expect(previewOf("image", { image: { caption: "menu" } })).toBe("📷 Photo · menu")
    expect(previewOf("document", { document: { filename: "q.pdf" } })).toBe("📄 Document · q.pdf")
    expect(previewOf("interactive", { interactive: { button_reply: { title: "Yes" } } })).toBe("Yes")
    expect(previewOf("reaction", { reaction: { emoji: "👍" } })).toBe("Reacted 👍")
    expect(previewOf("template", { _rendered: "Hi Jane", template: { name: "t" } })).toBe("Hi Jane")
    expect(previewOf("text", { text: { body: "x".repeat(300) } })).toHaveLength(200)
  })
})

describe("toMessageDTO", () => {
  it("exposes stored media URLs and captions", () => {
    const dto = toMessageDTO({
      id: "wamid.1", thread_id: "1", direction: "in", type: "image", status: "received", created_at: "2026-01-01T00:00:00Z",
      payload_json: { image: { id: "M", caption: "look", mime_type: "image/jpeg", stored_url: "https://s/x.jpg" }, context: { id: "wamid.0" } }
    })
    expect(dto.media).toEqual({ kind: "image", url: "https://s/x.jpg", mime_type: "image/jpeg", filename: undefined, caption: "look" })
    expect(dto.text).toBe("look")
    expect(dto.reply_to).toBe("wamid.0")
  })
})

describe("normalizeWaId", () => {
  it("accepts international formats", () => {
    expect(normalizeWaId("+1 (415) 555-2671")).toBe("14155552671")
    expect(normalizeWaId("0091 98765 43210")).toBe("919876543210")
    expect(normalizeWaId(919876543210)).toBe("919876543210")
  })
  it("rejects local or implausible numbers", () => {
    expect(normalizeWaId("098765 43210")).toBeNull()
    expect(normalizeWaId("12345")).toBeNull()
    expect(normalizeWaId("1234567890123456")).toBeNull()
    expect(normalizeWaId("")).toBeNull()
    expect(normalizeWaId(undefined)).toBeNull()
  })
})

describe("isValidSignature", () => {
  const secret = "s3cret"
  const body = Buffer.from('{"object":"whatsapp_business_account"}')
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
  it("accepts a correct signature", () => expect(isValidSignature(body, sig, secret)).toBe(true))
  it("rejects a tampered body", () => expect(isValidSignature(Buffer.from("{}"), sig, secret)).toBe(false))
  it("rejects garbage and missing inputs", () => {
    expect(isValidSignature(body, "sha256=zz", secret)).toBe(false)
    expect(isValidSignature(body, undefined, secret)).toBe(false)
    expect(isValidSignature(body, sig, undefined)).toBe(false)
  })
})

describe("GraphError.retryable", () => {
  it("retries throttling and server errors only", () => {
    expect(new GraphError("x", 500).retryable).toBe(true)
    expect(new GraphError("x", 400, 130429).retryable).toBe(true)
    expect(new GraphError("x", 0).retryable).toBe(true)
    expect(new GraphError("x", 400, 131026).retryable).toBe(false)
    expect(new GraphError("x", 400, 131047).retryable).toBe(false)
  })
})

describe("contact helpers", () => {
  it("knows when the 24h customer service window is open", () => {
    const now = Date.parse("2026-01-02T12:00:00Z")
    expect(isWindowOpen("2026-01-02T00:00:00Z", now)).toBe(true)
    expect(isWindowOpen("2026-01-01T11:59:00Z", now)).toBe(false)
    expect(isWindowOpen(null, now)).toBe(false)
  })

  it("sanitizes search terms for PostgREST filters", () => {
    expect(sanitizeSearch("acme, (inc)*%")).toBe("acme inc")
    expect(sanitizeSearch("x".repeat(200))).toHaveLength(80)
  })

  it("normalizes tags and canonicalizes VIP", () => {
    expect(normalizeTags(["vip", " Lead ", "lead", "", "VIP"])).toEqual(["VIP", "Lead"])
    expect(normalizeTags("nope")).toEqual([])
  })

  it("maps rows to DTOs with deal info", () => {
    const dto = toContactDTO({
      id: 1, wa_id: "15551234567", display_name: null, phone_e164: "+15551234567", tags: null, origin: "inbox",
      last_inbound_at: new Date().toISOString(), deals: [{ id: 9, value: "250.5", stage_id: 2, pipeline_stages: { name: "Active" } }]
    })
    expect(dto.name).toBe("+15551234567")
    expect(dto.tags).toEqual([])
    expect(dto.window_open).toBe(true)
    expect(dto.deal).toEqual({ id: 9, value: 250.5, stage_id: 2, stage_name: "Active" })
  })
})
