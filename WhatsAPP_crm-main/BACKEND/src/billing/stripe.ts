import Stripe from "stripe"
import { supabaseAdmin, must } from "../common/db"
import { invalidatePlan } from "./entitlements"
import { isPaidStatus, planFromPriceId, type PlanId } from "./plans"

let client: Stripe | null = null

export function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY || "", { maxNetworkRetries: 2 })
  return client
}

/** Stores the subscription on its tenant; the price decides the plan. */
export async function syncSubscription(sub: Stripe.Subscription, tenantIdHint?: string | null) {
  const s = supabaseAdmin()
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  let tenantId = tenantIdHint || (sub.metadata?.tenant_id as string | undefined) || null
  if (!tenantId) {
    const { data } = await s.from("tenants").select("id").eq("stripe_customer_id", customerId).maybeSingle()
    tenantId = data?.id ?? null
  }
  if (!tenantId) {
    console.warn(JSON.stringify({ event: "stripe_tenant_not_found", customer: customerId, subscription: sub.id }))
    return null
  }
  const item = sub.items?.data?.[0]
  const paidPlan = planFromPriceId(item?.price?.id)
  const plan: PlanId = paidPlan && isPaidStatus(sub.status) ? paidPlan : "starter"
  const periodEnd = item?.current_period_end
  must(
    await s.from("tenants").update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.status === "canceled" ? null : sub.id,
      subscription_status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end)
    }).eq("id", tenantId),
    "sync_subscription"
  )
  invalidatePlan(tenantId)
  return { tenantId, plan, status: sub.status }
}

/** Returns true the first time an event id is seen. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
    .select("id")
  if (error) throw new Error(`stripe_event_claim_failed: ${error.message}`)
  return (data || []).length > 0
}

export async function releaseEvent(eventId: string) {
  await supabaseAdmin().from("stripe_events").delete().eq("id", eventId)
}
