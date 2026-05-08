import { createClient } from "@supabase/supabase-js"

export function supabaseAuth() {
  const url = process.env.SUPABASE_URL || ""
  const anon = process.env.SUPABASE_ANON_KEY || ""
  return createClient(url, anon)
}

