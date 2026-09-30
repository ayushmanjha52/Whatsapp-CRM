import { env } from "../common/config"

export const GRAPH_BASE = `https://graph.facebook.com/${env.GRAPH_API_VERSION}`

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
    public title?: string,
    public details?: string,
    public fbtraceId?: string
  ) {
    super(message)
  }

  /** Throttling, transient and server-side errors are worth retrying; everything else is permanent. */
  get retryable(): boolean {
    if (this.status === 0 || this.status >= 500 || this.status === 429) return true
    return this.code !== undefined && RETRYABLE_CODES.has(this.code)
  }

  toJSON() {
    return { status: this.status, code: this.code, subcode: this.subcode, title: this.title, message: this.message, details: this.details }
  }
}

// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429, 131000, 131056, 133004])

type GraphOptions = {
  token: string
  method?: "GET" | "POST" | "DELETE"
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export async function graph<T = any>(path: string, opts: GraphOptions): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`)
  for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined) url.searchParams.set(k, String(v))
  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(30000)
    })
  } catch (e: any) {
    throw new GraphError(`network_error: ${e?.message || e}`, 0)
  }
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok || json?.error) {
    const e = json?.error || {}
    throw new GraphError(
      e.error_user_msg || e.message || `graph_http_${res.status}`,
      res.status,
      e.code,
      e.error_subcode,
      e.error_user_title || e.type,
      e.error_data?.details,
      e.fbtrace_id
    )
  }
  return json as T
}

export type SendResult = { messaging_product: string; contacts?: { wa_id: string }[]; messages: { id: string }[] }

export function sendMessage(phoneNumberId: string, token: string, to: string, payload: Record<string, unknown>) {
  return graph<SendResult>(`${phoneNumberId}/messages`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }
  })
}

export function markRead(phoneNumberId: string, token: string, wamid: string) {
  return graph(`${phoneNumberId}/messages`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", status: "read", message_id: wamid }
  })
}

export async function listTemplates(wabaId: string, token: string): Promise<any[]> {
  const out: any[] = []
  let next: string | undefined = `${wabaId}/message_templates`
  let query: GraphOptions["query"] = { fields: "id,name,language,status,category,components,rejected_reason,parameter_format", limit: 100 }
  while (next) {
    const page: any = await graph(next, { token, query })
    out.push(...(page.data || []))
    next = page.paging?.next
    query = undefined
    if (out.length > 2000) break
  }
  return out
}

export function createTemplate(wabaId: string, token: string, body: unknown) {
  return graph<{ id: string; status: string; category: string }>(`${wabaId}/message_templates`, { token, method: "POST", body })
}

export function deleteTemplate(wabaId: string, token: string, name: string) {
  return graph(`${wabaId}/message_templates`, { token, method: "DELETE", query: { name } })
}

/** Subscribes our Meta app to the WABA so its webhooks reach us. Required after onboarding. */
export function subscribeApp(wabaId: string, token: string) {
  return graph(`${wabaId}/subscribed_apps`, { token, method: "POST" })
}

export function getPhoneNumber(phoneNumberId: string, token: string) {
  return graph<any>(phoneNumberId, {
    token,
    query: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput,status,name_status,account_mode" }
  })
}

export function listPhoneNumbers(wabaId: string, token: string) {
  return graph<{ data: any[] }>(`${wabaId}/phone_numbers`, {
    token,
    query: { fields: "id,display_phone_number,verified_name,quality_rating,status,account_mode,name_status" }
  })
}

/**
 * Meta's Resumable Upload API: returns the `header_handle` a media-header template
 * needs as its sample. https://developers.facebook.com/docs/graph-api/guides/upload
 */
export async function uploadTemplateSample(appId: string, token: string, file: { bytes: Uint8Array; mimeType: string; fileName: string }): Promise<string> {
  const session = await graph<{ id: string }>(`${appId}/uploads`, {
    token,
    method: "POST",
    query: { file_name: file.fileName, file_length: file.bytes.byteLength, file_type: file.mimeType }
  })
  let res: Response
  try {
    res = await fetch(`${GRAPH_BASE}/${session.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      body: file.bytes,
      signal: AbortSignal.timeout(120_000)
    })
  } catch (e: any) {
    throw new GraphError(`network_error: ${e?.message || e}`, 0)
  }
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok || !json?.h) {
    const e = json?.error || {}
    throw new GraphError(e.error_user_msg || e.message || `upload_failed_${res.status}`, res.status, e.code, e.error_subcode, e.error_user_title)
  }
  return json.h as string
}

export function getMediaUrl(mediaId: string, token: string) {
  return graph<{ url: string; mime_type: string; file_size: number }>(mediaId, { token })
}
