import { supabaseAdmin } from "../common/db"

export async function logAuth(event: string, success: boolean, opts: { user_id?: string; reason?: string; ip?: string; user_agent?: string }) {
  const s = supabaseAdmin()
  await s.from("auth_logs").insert({
    user_id: opts.user_id ?? null,
    event,
    success,
    reason: opts.reason,
    ip: opts.ip,
    user_agent: opts.user_agent
  })
}

