import { createClient } from "@supabase/supabase-js"
import { env } from "./config"

/** Anon-key client for Supabase Auth calls. A fresh client per call keeps sessions from leaking between requests. */
export function supabaseAuth() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
