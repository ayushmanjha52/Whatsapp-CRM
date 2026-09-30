import { supabaseAdmin } from "../common/db"
import { HttpError } from "../http/errors"
import { billingEnabled, effectivePlan, FEATURE_PLAN, PLANS, type Feature, type Plan } from "./plans"

const cache = new Map<string, { plan: Plan; exp: number }>()

export function invalidatePlan(tenantId: string) {
  cache.delete(tenantId)
}

export async function getTenantPlan(tenantId: string): Promise<Plan> {
  if (!billingEnabled()) return PLANS.business
  const hit = cache.get(tenantId)
  if (hit && hit.exp > Date.now()) return hit.plan
  const { data } = await supabaseAdmin().from("tenants").select("plan,subscription_status").eq("id", tenantId).maybeSingle()
  const plan = PLANS[effectivePlan(data)]
  cache.set(tenantId, { plan, exp: Date.now() + 30_000 })
  return plan
}

function upgradeRequired(message: string, needed: string) {
  return new HttpError(402, "upgrade_required", message, { plan: needed })
}

export async function assertFeature(tenantId: string, feature: Feature) {
  const plan = await getTenantPlan(tenantId)
  if (plan.features[feature]) return
  const needed = PLANS[FEATURE_PLAN[feature]]
  const what = feature === "broadcasts" ? "send broadcasts" : "use AI reply suggestions"
  throw upgradeRequired(`Upgrade to ${needed.name} to ${what}.`, needed.id)
}

/** Seats = active members + pending invites. */
export async function assertSeatAvailable(tenantId: string) {
  const plan = await getTenantPlan(tenantId)
  if (!Number.isFinite(plan.seats)) return
  const { count } = await supabaseAdmin().from("tenant_members").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
  if ((count ?? 0) >= plan.seats) {
    throw upgradeRequired(`Your ${plan.name} plan includes ${plan.seats} seat${plan.seats === 1 ? "" : "s"}. Upgrade to add teammates.`, plan.id === "starter" ? "growth" : "business")
  }
}

export async function conversationsThisMonth(tenantId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("crm_conversations_this_month", { p_tenant: tenantId })
  if (error) throw new Error(`usage_lookup_failed: ${error.message}`)
  return Number(data || 0)
}

/**
 * Replying in a chat that is already counted this month is always allowed;
 * starting a new one needs room in the monthly quota. Inbound messages are never blocked.
 */
export async function assertConversationQuota(tenantId: string, waId: string) {
  const plan = await getTenantPlan(tenantId)
  if (!Number.isFinite(plan.conversations)) return
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { count: existing } = await supabaseAdmin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("thread_id", waId)
    .gte("created_at", monthStart.toISOString())
  if ((existing ?? 0) > 0) return
  if ((await conversationsThisMonth(tenantId)) >= plan.conversations) {
    throw upgradeRequired(`You've used all ${plan.conversations} conversations included this month. Upgrade for unlimited conversations.`, "growth")
  }
}
