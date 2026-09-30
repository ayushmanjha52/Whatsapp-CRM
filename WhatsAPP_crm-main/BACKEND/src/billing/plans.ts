/** Subscription plans and what each unlocks. Pure: no I/O. */

export type PlanId = "starter" | "growth" | "business"
export type Feature = "broadcasts" | "ai"

export type Plan = {
  id: PlanId
  name: string
  price: number
  conversations: number
  seats: number
  features: Record<Feature, boolean>
  blurb: string
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 0,
    conversations: 100,
    seats: 1,
    features: { broadcasts: false, ai: false },
    blurb: "For solopreneurs getting started."
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 29,
    conversations: Infinity,
    seats: 3,
    features: { broadcasts: true, ai: false },
    blurb: "For growing teams that broadcast and follow up."
  },
  business: {
    id: "business",
    name: "Business",
    price: 79,
    conversations: Infinity,
    seats: Infinity,
    features: { broadcasts: true, ai: true },
    blurb: "Unlimited seats and AI reply suggestions."
  }
}

export const FEATURE_PLAN: Record<Feature, PlanId> = { broadcasts: "growth", ai: "business" }

/** Billing (and therefore every limit) is off until Stripe is configured — self-hosted installs get everything. */
export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function priceIdFor(plan: PlanId): string | undefined {
  if (plan === "growth") return process.env.STRIPE_PRICE_GROWTH
  if (plan === "business") return process.env.STRIPE_PRICE_BUSINESS
  return undefined
}

export function planFromPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return "growth"
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business"
  return null
}

/** Stripe statuses that keep paid features on (past_due gets Stripe's retry grace period). */
export function isPaidStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
}

/** The plan in force: the paid plan while its subscription is live, otherwise Starter. */
export function effectivePlan(tenant: { plan?: string | null; subscription_status?: string | null } | null | undefined): PlanId {
  if (!billingEnabled()) return "business"
  const plan = (tenant?.plan || "starter") as PlanId
  if (plan === "starter" || !PLANS[plan]) return "starter"
  return isPaidStatus(tenant?.subscription_status) ? plan : "starter"
}

export function limitLabel(n: number): number | null {
  return Number.isFinite(n) ? n : null
}
