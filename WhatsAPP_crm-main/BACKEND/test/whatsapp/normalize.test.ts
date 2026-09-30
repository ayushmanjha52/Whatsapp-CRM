import { describe, it, expect } from "bun:test"
import { normalizeWebhook, mediaOf } from "../../src/whatsapp/normalize"
import sample from "../webhook-sample.json"

describe("normalizeWebhook", () => {
  it("extracts inbound messages with the sender's profile name", () => {
    const events = normalizeWebhook(sample)
    expect(events).toHaveLength(1)
    const ev = events[0] as any
    expect(ev.kind).toBe("message")
    expect(ev.waId).toBe("16505551234")
    expect(ev.profileName).toBe("Test")
    expect(ev.phoneNumberId).toBe("106540352242922")
    expect(ev.timestampMs).toBe(1739230955000)
  })

  it("processes every entry and change, not just the first", () => {
    const change = (id: string) => ({
      field: "messages",
      value: { metadata: { phone_number_id: "P" }, messages: [{ id, from: "1", timestamp: "1", type: "text", text: { body: id } }] }
    })
    const body = { object: "whatsapp_business_account", entry: [{ id: "W1", changes: [change("a"), change("b")] }, { id: "W2", changes: [change("c")] }] }
    expect(normalizeWebhook(body).map((e: any) => e.message.id)).toEqual(["a", "b", "c"])
  })

  it("extracts delivery statuses with their error", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ id: "W", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "P" },
        statuses: [
          { id: "wamid.1", status: "delivered", timestamp: "100", recipient_id: "1" },
          { id: "wamid.2", status: "failed", timestamp: "101", recipient_id: "1", errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "x" } }] }
        ]
      } }] }]
    }
    const [a, b] = normalizeWebhook(body) as any[]
    expect(a).toMatchObject({ kind: "status", wamid: "wamid.1", status: "delivered", timestampMs: 100000 })
    expect(b.error).toEqual({ code: 131026, title: "Message undeliverable", message: undefined, details: "x" })
  })

  it("extracts template status updates", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ id: "WABA", changes: [{ field: "message_template_status_update", value: {
        event: "REJECTED", message_template_id: 99, message_template_name: "promo", message_template_language: "en_US", reason: "INVALID_FORMAT"
      } }] }]
    }
    expect(normalizeWebhook(body)).toEqual([
      { kind: "template_status", wabaId: "WABA", event: "REJECTED", templateId: "99", name: "promo", language: "en_US", reason: "INVALID_FORMAT" }
    ])
  })

  it("ignores other objects and malformed input", () => {
    expect(normalizeWebhook({ object: "page", entry: [] })).toEqual([])
    expect(normalizeWebhook(null)).toEqual([])
    expect(normalizeWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages: [{ type: "text" }] } }] }] })).toEqual([])
  })

  it("finds media attachments", () => {
    expect(mediaOf({ type: "image", image: { id: "M1" } })).toEqual({ kind: "image", id: "M1" })
    expect(mediaOf({ type: "text", text: { body: "hi" } })).toBeNull()
  })
})
