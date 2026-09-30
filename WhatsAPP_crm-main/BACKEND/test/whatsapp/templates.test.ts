import { describe, it, expect } from "bun:test"
import {
  assertMappingComplete, buildCreateTemplateRequest, buildTemplateMessage, extractVariables,
  sanitizeTemplateName, stripLocalFields, templateShape, TemplateMappingError, type TemplateRow
} from "../../src/whatsapp/templates"

const positional: TemplateRow = {
  name: "order_update",
  language: "en_US",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hi {{1}}" },
    { type: "BODY", text: "Hello {{1}}, your order from {{2}} has shipped." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Thanks" }] }
  ]
}

const contact = { wa_id: "14155550100", display_name: "Jane Doe", company: "Acme", custom_fields: { city: "Pune" } }

describe("template variables", () => {
  it("extracts unique variables in order", () => {
    expect(extractVariables("{{1}} and {{ 2 }} and {{1}}")).toEqual(["1", "2"])
    expect(extractVariables("Hi {{first_name}}")).toEqual(["first_name"])
  })

  it("describes the template shape", () => {
    const shape = templateShape(positional.components)
    expect(shape.headerVars).toEqual(["1"])
    expect(shape.bodyVars).toEqual(["1", "2"])
    expect(shape.footerText).toBe("Reply STOP to opt out")
    expect(shape.buttons).toHaveLength(1)
  })

  it("requires a mapping for every variable and media header", () => {
    const shape = templateShape(positional.components)
    expect(() => assertMappingComplete(shape, { "body.1": { source: "field", field: "name" } })).toThrow(TemplateMappingError)
    try {
      assertMappingComplete(shape, {})
    } catch (e: any) {
      expect(e.missing).toEqual(["header.1", "body.1", "body.2"])
    }
    const media = templateShape([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }])
    expect(() => assertMappingComplete(media, {})).toThrow(TemplateMappingError)
    expect(() => assertMappingComplete(media, {}, "https://x/y.jpg")).not.toThrow()
  })
})

describe("buildTemplateMessage", () => {
  it("fills positional parameters from contact fields and renders a preview", () => {
    const { payload } = buildTemplateMessage(positional, {
      "header.1": { source: "field", field: "first_name" },
      "body.1": { source: "field", field: "name" },
      "body.2": { source: "field", field: "company" }
    }, contact)
    expect(payload.template).toEqual({
      name: "order_update",
      language: { code: "en_US" },
      components: [
        { type: "header", parameters: [{ type: "text", text: "Jane" }] },
        { type: "body", parameters: [{ type: "text", text: "Jane Doe" }, { type: "text", text: "Acme" }] }
      ]
    })
    expect(payload._rendered).toBe("Hi Jane\n\nHello Jane Doe, your order from Acme has shipped.\n\nReply STOP to opt out")
  })

  it("uses fallbacks and never sends empty parameters", () => {
    const { payload } = buildTemplateMessage(positional, {
      "header.1": { source: "field", field: "first_name", fallback: "there" },
      "body.1": { source: "static", value: "friend" },
      "body.2": { source: "field", field: "custom.missing" }
    }, { wa_id: "1", display_name: "1" })
    const [header, body] = payload.template.components
    expect(header.parameters[0].text).toBe("there")
    expect(body.parameters[1].text).toBe(" ")
  })

  it("supports named parameters and custom fields", () => {
    const tpl: TemplateRow = { name: "n", language: "en", parameter_format: "NAMED", components: [{ type: "BODY", text: "Hi {{first_name}} from {{city}}" }] }
    const { payload } = buildTemplateMessage(tpl, {
      "body.first_name": { source: "field", field: "first_name" },
      "body.city": { source: "field", field: "custom.city" }
    }, contact)
    expect(payload.template.components[0].parameters).toEqual([
      { type: "text", parameter_name: "first_name", text: "Jane" },
      { type: "text", parameter_name: "city", text: "Pune" }
    ])
  })

  it("adds a media header parameter", () => {
    const tpl: TemplateRow = { name: "m", language: "en", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Sale!" }] }
    const { payload } = buildTemplateMessage(tpl, {}, contact, "https://cdn/x.jpg")
    expect(payload.template.components).toEqual([{ type: "header", parameters: [{ type: "image", image: { link: "https://cdn/x.jpg" } }] }])
  })

  it("strips local-only fields before sending", () => {
    const { payload } = buildTemplateMessage({ name: "t", language: "en", components: [{ type: "BODY", text: "Hi" }] }, {}, contact)
    expect(stripLocalFields(payload)).toEqual({ type: "template", template: { name: "t", language: { code: "en" } } })
  })
})

describe("buildCreateTemplateRequest", () => {
  it("adds the examples Meta requires for positional variables", () => {
    const req = buildCreateTemplateRequest({
      name: "Summer Sale!", language: "en_US", category: "MARKETING",
      header_text: "Hey {{1}}", body: "Hi {{1}}, {{2}} off today", footer: "Acme",
      examples: { "1": "Jane", "2": "20%" }, buttons: [{ type: "QUICK_REPLY", text: "Stop" }]
    })
    expect(req.name).toBe("summer_sale")
    expect(req.components).toEqual([
      { type: "HEADER", format: "TEXT", text: "Hey {{1}}", example: { header_text: ["Jane"] } },
      { type: "BODY", text: "Hi {{1}}, {{2}} off today", example: { body_text: [["Jane", "20%"]] } },
      { type: "FOOTER", text: "Acme" },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Stop" }] }
    ])
  })

  it("uses named-parameter examples for named variables", () => {
    const req: any = buildCreateTemplateRequest({ name: "x", language: "en", category: "UTILITY", body: "Hi {{name}}", examples: { name: "Jane" } })
    expect(req.parameter_format).toBe("NAMED")
    expect(req.components[0].example).toEqual({ body_text_named_params: [{ param_name: "name", example: "Jane" }] })
  })

  it("rejects out-of-order positional variables", () => {
    expect(() => buildCreateTemplateRequest({ name: "x", language: "en", category: "UTILITY", body: "Hi {{2}}" })).toThrow("body_variables_must_be_sequential")
  })

  it("sanitizes names", () => {
    expect(sanitizeTemplateName("  Hello World -- 2024 ")).toBe("hello_world_2024")
  })
})
