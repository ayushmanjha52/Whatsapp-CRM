import { ZodError, type ZodTypeAny, type z } from "zod"

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message || code)
  }
}

export const badRequest = (code = "invalid_request", message?: string, details?: unknown) => new HttpError(400, code, message, details)
export const unauthorized = (code = "unauthorized", message?: string) => new HttpError(401, code, message)
export const forbidden = (code = "forbidden", message?: string) => new HttpError(403, code, message)
export const notFound = (code = "not_found", message?: string) => new HttpError(404, code, message)
export const conflict = (code = "conflict", message?: string, details?: unknown) => new HttpError(409, code, message, details)
export const unprocessable = (code: string, message?: string, details?: unknown) => new HttpError(422, code, message, details)

/** Validates input with zod, turning failures into a 400 with field-level details. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input ?? {})
  if (!r.success) {
    throw badRequest("validation_error", "Some fields are invalid", r.error.issues.map(i => ({ path: i.path.join("."), message: i.message })))
  }
  return r.data
}

export function toErrorResponse(err: any): { status: number; body: { error: string; message: string; details?: unknown } } {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }
  }
  if (err instanceof ZodError) {
    return { status: 400, body: { error: "validation_error", message: "Some fields are invalid", details: err.issues } }
  }
  const status = Number(err?.statusCode) || 500
  if (status < 500) {
    return { status, body: { error: err?.code ? String(err.code).toLowerCase() : "request_error", message: err?.message || "Request error" } }
  }
  return { status: 500, body: { error: "internal_error", message: "Something went wrong" } }
}
