import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type Stripe from "stripe"
import { supabaseAdmin, must } from "../../../src/common/db"
import { env } from "../../../src/common/config"
import { requireAdmin } from "../../../src/http/auth"
import { badRequest, parse, unprocessable } from "../../../src/http/errors"
import { billingEnabled, effectivePlan, limitLabel, PLANS, priceIdFor, type PlanId } from "../../../src/billing/plans"
import { conversationsThisMonth } from "../../../src/billing/entitlements"
import { claimEvent, releaseEvent, stripe, syncSubscription } from "../../../src/billing/stripe"

function planDTO(id: PlanId) {
  const p = PLANS[id]
  return { id, name: p.name, price: p.price, blurb: p.blurb, conversations: limitLabel(p.conversations), seats: limitLabel(p.seats), features: p.features }
}

function requireBilling() {
  if (!billingEnabled()) throw unprocessable("billing_disabled", "Billing is not configured on this server")
}

/** Authenticated billing endpoints, mounted under /api. */
export default async function billingRoutes(app: FastifyInstance) {
  app.get("/billing", async req => {
    const tenantId = req.auth.tenantId
    const s = supabaseAdmin()
    const [{ data: tenant }, { count: seats }, conversations] = await Promise.all([
      s.from("tenants").select("plan,subscription_status,current_period_end,cancel_at_period_end,stripe_customer_id").eq("id", tenantId).maybeSingle(),
      s.from("tenant_members").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      conversationsThisMonth(tenantId)
    ])
    const current = effectivePlan(tenant)
    return {
      enabled: billingEnabled(),
      plan: planDTO(current),
      status: tenant?.subscription_status ?? null,
      current_period_end: tenant?.current_period_end ?? null,
      cancel_at_period_end: tenant?.cancel_at_period_end ?? false,
      has_customer: Boolean(tenant?.stripe_customer_id),
      usage: { conversations, seats: seats ?? 0 },
      plans: (Object.keys(PLANS) as PlanId[]).map(planDTO)
    }
  })

  app.post("/billing/checkout", async req => {
    requireAdmin(req)
    requireBilling()
    const body = parse(z.object({ plan: z.enum(["growth", "business"]) }), req.body)
    const price = priceIdFor(body.plan)
    if (!price) throw unprocessable("price_not_configured", `STRIPE_PRICE_${body.plan.toUpperCase()} is not set`)
    const s = supabaseAdmin()
    const { data: tenant } = await s.from("tenants").select("id,name,stripe_customer_id,stripe_subscription_id,subscription_status").eq("id", req.auth.tenantId).maybeSingle()

    // Already subscribed: plan changes and cancellations go through the customer portal.
    if (tenant?.stripe_subscription_id && tenant.subscription_status && tenant.subscription_status !== "canceled") {
      throw badRequest("already_subscribed", "Use “Manage billing” to change or cancel your plan")
    }

    let customerId = tenant?.stripe_customer_id as string | undefined
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: req.auth.email,
        name: tenant?.name || undefined,
        metadata: { tenant_id: req.auth.tenantId }
      })
      customerId = customer.id
      must(await s.from("tenants").update({ stripe_customer_id: customerId }).eq("id", req.auth.tenantId), "save_customer")
    }
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: req.auth.tenantId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { tenant_id: req.auth.tenantId } },
      metadata: { tenant_id: req.auth.tenantId },
      success_url: `${env.FRONTEND_BASE_URL}/settings?tab=billing&checkout=success`,
      cancel_url: `${env.FRONTEND_BASE_URL}/settings?tab=billing&checkout=cancelled`
    })
    return { url: session.url }
  })

  app.post("/billing/portal", async req => {
    requireAdmin(req)
    requireBilling()
    const { data: tenant } = await supabaseAdmin().from("tenants").select("stripe_customer_id").eq("id", req.auth.tenantId).maybeSingle()
    if (!tenant?.stripe_customer_id) throw badRequest("no_customer", "Subscribe to a plan first")
    const session = await stripe().billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${env.FRONTEND_BASE_URL}/settings?tab=billing`
    })
    return { url: session.url }
  })
}

/** Public Stripe webhook (needs the raw body for signature verification). */
export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.removeContentTypeParser("application/json")
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body))

  app.post("/webhooks/stripe", async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!billingEnabled() || !secret) return res.status(503).send({ error: "billing_disabled" })
    let event: Stripe.Event
    try {
      // Async variant: under Bun the SDK uses Web Crypto, which has no synchronous HMAC.
      event = await stripe().webhooks.constructEventAsync(req.body as Buffer, req.headers["stripe-signature"] as string, secret)
    } catch (e: any) {
      req.log.warn({ err: e?.message }, "stripe_signature_invalid")
      return res.status(400).send({ error: "invalid_signature" })
    }
    if (!(await claimEvent(event))) return { received: true, duplicate: true }
    try {
      await handleStripeEvent(event)
    } catch (e) {
      await releaseEvent(event.id)
      throw e
    }
    return { received: true }
  })
}

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== "subscription" || !session.subscription) return
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
      const sub = await stripe().subscriptions.retrieve(subId)
      await syncSubscription(sub, session.client_reference_id || session.metadata?.tenant_id)
      return
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(event.data.object as Stripe.Subscription)
      return
    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as any
      const subId = invoice.parent?.subscription_details?.subscription || invoice.subscription
      if (!subId) return
      const sub = await stripe().subscriptions.retrieve(typeof subId === "string" ? subId : subId.id)
      await syncSubscription(sub)
      return
    }
  }
}
