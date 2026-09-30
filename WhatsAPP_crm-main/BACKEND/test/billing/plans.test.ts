import { describe, it, expect, afterEach } from "bun:test"
import { effectivePlan, isPaidStatus, planFromPriceId, PLANS } from "../../src/billing/plans"

const saved = { ...process.env }
afterEach(() => {
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_BUSINESS"]) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("plans", () => {
  it("unlocks everything when billing is not configured", () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(effectivePlan({ plan: "starter" })).toBe("business")
    expect(effectivePlan(null)).toBe("business")
  })

  it("keeps paid plans only while the subscription is live", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"
    expect(effectivePlan({ plan: "growth", subscription_status: "active" })).toBe("growth")
    expect(effectivePlan({ plan: "growth", subscription_status: "past_due" })).toBe("growth")
    expect(effectivePlan({ plan: "business", subscription_status: "canceled" })).toBe("starter")
    expect(effectivePlan({ plan: "growth", subscription_status: "incomplete" })).toBe("starter")
    expect(effectivePlan({ plan: "bogus", subscription_status: "active" })).toBe("starter")
    expect(effectivePlan(null)).toBe("starter")
  })

  it("maps Stripe prices to plans", () => {
    process.env.STRIPE_PRICE_GROWTH = "price_g"
    process.env.STRIPE_PRICE_BUSINESS = "price_b"
    expect(planFromPriceId("price_g")).toBe("growth")
    expect(planFromPriceId("price_b")).toBe("business")
    expect(planFromPriceId("price_other")).toBeNull()
    expect(planFromPriceId(undefined)).toBeNull()
  })

  it("matches the advertised limits", () => {
    expect(PLANS.starter.conversations).toBe(100)
    expect(PLANS.starter.features.broadcasts).toBe(false)
    expect(PLANS.growth.seats).toBe(3)
    expect(PLANS.growth.features.ai).toBe(false)
    expect(PLANS.business.features.ai).toBe(true)
    expect(isPaidStatus("trialing")).toBe(true)
    expect(isPaidStatus("unpaid")).toBe(false)
  })
})
