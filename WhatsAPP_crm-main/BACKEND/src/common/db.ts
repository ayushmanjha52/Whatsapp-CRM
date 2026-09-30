import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "./config"

let admin: SupabaseClient | null = null

/** Service-role client (bypasses RLS). Every query must filter by tenant_id explicitly. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  }
  return admin
}

/** Unwraps a Supabase response, throwing on error so callers never silently read partial data. */
export function must<T>(res: { data: T; error: any }, context: string): NonNullable<T> {
  if (res.error) {
    const err = new Error(`${context}: ${res.error.message || res.error}`)
    ;(err as any).cause = res.error
    throw err
  }
  return res.data as NonNullable<T>
}
