/** WhatsApp message template helpers. Pure: no I/O. */

export type TemplateRow = {
  name: string
  language: string
  category?: string
  status?: string
  parameter_format?: string | null
  components: any[]
}

export type VariableSource =
  | { source: "field"; field: string; fallback?: string }
  | { source: "static"; value: string }

/** Keys look like "body.1", "body.first_name" or "header.1". */
export type VariableMapping = Record<string, VariableSource>

export type ContactFields = {
  display_name?: string | null
  wa_id: string
  phone_e164?: string | null
  email?: string | null
  company?: string | null
  custom_fields?: Record<string, unknown> | null
}

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export function extractVariables(text: string | undefined | null): string[] {
  const out: string[] = []
  if (!text) return out
  for (const m of text.matchAll(VAR_RE)) if (!out.includes(m[1]!)) out.push(m[1]!)
  return out
}

export function componentOf(components: any[], type: string) {
  return (components || []).find(c => String(c?.type).toUpperCase() === type)
}

export type TemplateShape = {
  headerFormat: string | null
  headerText: string | null
  headerVars: string[]
  bodyText: string
  bodyVars: string[]
  footerText: string | null
  buttons: { type: string; text: string; url?: string; phone_number?: string }[]
  /** Link buttons whose URL ends in a variable; each is mapped as "button.<index>". */
  urlButtons: { index: number; variable: string; url: string }[]
  dynamicUrlButtons: number
}

export function templateShape(components: any[]): TemplateShape {
  const header = componentOf(components, "HEADER")
  const body = componentOf(components, "BODY")
  const footer = componentOf(components, "FOOTER")
  const buttons = componentOf(components, "BUTTONS")?.buttons || []
  const headerFormat = header ? String(header.format || "TEXT").toUpperCase() : null
  const urlButtons = buttons
    .map((b: any, index: number) => ({ index, variable: extractVariables(b.url)[0], url: b.url, type: b.type }))
    .filter((b: any) => b.type === "URL" && b.variable)
    .map(({ index, variable, url }: any) => ({ index, variable, url }))
  return {
    headerFormat,
    headerText: headerFormat === "TEXT" ? header.text || "" : null,
    headerVars: headerFormat === "TEXT" ? extractVariables(header.text) : [],
    bodyText: body?.text || "",
    bodyVars: extractVariables(body?.text),
    footerText: footer?.text || null,
    buttons: buttons.map((b: any) => ({ type: b.type, text: b.text, url: b.url, phone_number: b.phone_number })),
    urlButtons,
    dynamicUrlButtons: urlButtons.length
  }
}

export function contactFieldValue(field: string, c: ContactFields): string {
  const name = (c.display_name && c.display_name !== c.wa_id ? c.display_name : "") || ""
  switch (field) {
    case "name":
      return name
    case "first_name":
      return name.split(/\s+/)[0] || ""
    case "phone":
      return c.phone_e164 || `+${c.wa_id}`
    case "email":
      return c.email || ""
    case "company":
      return c.company || ""
    default:
      if (field.startsWith("custom.")) {
        const v = c.custom_fields?.[field.slice(7)]
        return v === undefined || v === null ? "" : String(v)
      }
      return ""
  }
}

export function resolveVariable(src: VariableSource | undefined, c: ContactFields): string {
  if (!src) return ""
  if (src.source === "static") return src.value ?? ""
  const v = contactFieldValue(src.field, c).trim()
  return v || src.fallback || ""
}

export class TemplateMappingError extends Error {
  constructor(public missing: string[]) {
    super(`missing_template_variables: ${missing.join(", ")}`)
  }
}

/** Throws unless every variable in the template has a mapping (a static value or a field). */
export function assertMappingComplete(shape: TemplateShape, mapping: VariableMapping, headerMediaUrl?: string | null) {
  const missing: string[] = []
  for (const v of shape.headerVars) if (!mapping[`header.${v}`]) missing.push(`header.${v}`)
  for (const v of shape.bodyVars) if (!mapping[`body.${v}`]) missing.push(`body.${v}`)
  for (const b of shape.urlButtons) if (!mapping[`button.${b.index}`]) missing.push(`button.${b.index}`)
  if (shape.headerFormat && ["IMAGE", "VIDEO", "DOCUMENT"].includes(shape.headerFormat) && !headerMediaUrl) missing.push("header.media")
  if (missing.length > 0) throw new TemplateMappingError(missing)
}

function param(name: string, value: string, named: boolean) {
  // WhatsApp rejects empty text parameters; a single space keeps the send valid.
  const text = value && value.trim() ? value : " "
  return named ? { type: "text", parameter_name: name, text } : { type: "text", text }
}

export function render(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_, k) => values[k] ?? `{{${k}}}`)
}

export type BuiltTemplateMessage = {
  /** Payload for POST /{phone-number-id}/messages (without messaging_product/to). */
  payload: { type: "template"; template: any; _rendered: string }
}

/** Builds the send payload for one contact. `_`-prefixed keys are stripped before sending. */
export function buildTemplateMessage(
  template: TemplateRow,
  mapping: VariableMapping,
  contact: ContactFields,
  headerMediaUrl?: string | null
): BuiltTemplateMessage {
  const shape = templateShape(template.components)
  const named = String(template.parameter_format || "").toUpperCase() === "NAMED"
  const components: any[] = []
  const headerValues: Record<string, string> = {}
  const bodyValues: Record<string, string> = {}

  if (shape.headerFormat === "TEXT" && shape.headerVars.length > 0) {
    const params = shape.headerVars.map(v => {
      headerValues[v] = resolveVariable(mapping[`header.${v}`], contact)
      return param(v, headerValues[v]!, named)
    })
    components.push({ type: "header", parameters: params })
  } else if (shape.headerFormat && ["IMAGE", "VIDEO", "DOCUMENT"].includes(shape.headerFormat) && headerMediaUrl) {
    const kind = shape.headerFormat.toLowerCase()
    components.push({ type: "header", parameters: [{ type: kind, [kind]: { link: headerMediaUrl } }] })
  }

  if (shape.bodyVars.length > 0) {
    const params = shape.bodyVars.map(v => {
      bodyValues[v] = resolveVariable(mapping[`body.${v}`], contact)
      return param(v, bodyValues[v]!, named)
    })
    components.push({ type: "body", parameters: params })
  }

  // Link buttons take the value that replaces the URL's variable suffix.
  for (const b of shape.urlButtons) {
    const value = resolveVariable(mapping[`button.${b.index}`], contact).trim()
    components.push({ type: "button", sub_type: "url", index: String(b.index), parameters: [{ type: "text", text: value || " " }] })
  }

  const rendered = [
    shape.headerText ? render(shape.headerText, headerValues) : "",
    render(shape.bodyText, bodyValues),
    shape.footerText || ""
  ].filter(Boolean).join("\n\n")

  return {
    payload: {
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(components.length > 0 ? { components } : {})
      },
      _rendered: rendered
    }
  }
}

/** Removes local-only fields (prefixed with "_") before a payload is sent to WhatsApp. */
export function stripLocalFields(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(payload)) if (!k.startsWith("_")) out[k] = v
  return out
}

export type CreateTemplateInput = {
  name: string
  language: string
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
  header_text?: string
  /** Media header: `handle` comes from Meta's resumable upload API. */
  header_media?: { format: "IMAGE" | "VIDEO" | "DOCUMENT"; handle: string }
  body: string
  footer?: string
  /** Example values keyed by variable ("1", "first_name") or "button.<index>" for link buttons. */
  examples?: Record<string, string>
  buttons?: ({ type: "QUICK_REPLY"; text: string } | { type: "URL"; text: string; url: string } | { type: "PHONE_NUMBER"; text: string; phone_number: string })[]
}

/** Meta requires template names in lowercase snake_case. */
export function sanitizeTemplateName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512)
}

/** Builds the POST /{waba-id}/message_templates body, with the examples Meta requires for variables. */
export function buildCreateTemplateRequest(input: CreateTemplateInput) {
  const examples = input.examples || {}
  const bodyVars = extractVariables(input.body)
  const headerVars = extractVariables(input.header_text)
  const all = [...headerVars, ...bodyVars]
  const named = all.some(v => !/^\d+$/.test(v))
  if (!named) {
    const nums = bodyVars.map(Number)
    const expected = nums.map((_, i) => i + 1)
    if (nums.join(",") !== expected.join(",")) throw new Error("body_variables_must_be_sequential")
  }
  const example = (v: string) => examples[v] || `example_${v}`
  const components: any[] = []
  if (input.header_media) {
    components.push({ type: "HEADER", format: input.header_media.format, example: { header_handle: [input.header_media.handle] } })
  } else if (input.header_text) {
    const header: any = { type: "HEADER", format: "TEXT", text: input.header_text }
    if (headerVars.length > 0) {
      header.example = named
        ? { header_text_named_params: headerVars.map(v => ({ param_name: v, example: example(v) })) }
        : { header_text: headerVars.map(example) }
    }
    components.push(header)
  }
  const body: any = { type: "BODY", text: input.body }
  if (bodyVars.length > 0) {
    body.example = named
      ? { body_text_named_params: bodyVars.map(v => ({ param_name: v, example: example(v) })) }
      : { body_text: [bodyVars.map(example)] }
  }
  components.push(body)
  if (input.footer) components.push({ type: "FOOTER", text: input.footer })
  if (input.buttons && input.buttons.length > 0) {
    const buttons = input.buttons.map((b, i) => {
      if (b.type !== "URL") return b
      const vars = extractVariables(b.url)
      if (vars.length === 0) return b
      // Meta allows one variable, at the very end of the URL, and needs a full example URL.
      if (vars.length > 1 || vars[0] !== "1" || !/\{\{\s*1\s*\}\}$/.test(b.url)) throw new Error("url_variable_must_be_trailing_{{1}}")
      return { ...b, example: [b.url.replace(/\{\{\s*1\s*\}\}$/, examples[`button.${i}`] || "example")] }
    })
    components.push({ type: "BUTTONS", buttons })
  }
  return {
    name: sanitizeTemplateName(input.name),
    language: input.language,
    category: input.category,
    ...(named ? { parameter_format: "NAMED" } : {}),
    components
  }
}
