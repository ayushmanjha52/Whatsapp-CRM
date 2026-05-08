import { createClient } from "@supabase/supabase-js"
import { getEnv } from "./config"

const env = getEnv()

export function supabaseAdmin() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE)
}

