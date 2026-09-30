import type { FastifyInstance } from "fastify"
import { supabaseAdmin, must } from "../../../src/common/db"
import { redis } from "../../../src/common/queue"
import { HttpError, unprocessable } from "../../../src/http/errors"
import { assertFeature } from "../../../src/billing/entitlements"
import { getContact } from "../../../src/crm/contacts"
import { toMessageDTO } from "../../../src/whatsapp/messages"
import { AiError, aiEnabled, suggestReplies } from "../../../src/ai/suggest"

const PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20)

export default async function aiRoutes(app: FastifyInstance) {
  app.get("/ai/status", async req => {
    let available = aiEnabled()
    if (available) {
      try { await assertFeature(req.auth.tenantId, "ai") } catch { available = false }
    }
    return { configured: aiEnabled(), available }
  })

  /** Three draft replies for the agent to pick from; nothing is sent automatically. */
  app.post("/conversations/:waId/suggest-replies", async req => {
    const { waId } = req.params as { waId: string }
    const tenantId = req.auth.tenantId
    if (!aiEnabled()) throw unprocessable("ai_not_configured", "AI suggestions need ANTHROPIC_API_KEY on the server")
    await assertFeature(tenantId, "ai")

    const r = redis()
    const key = `rl:ai:${tenantId}:${Math.floor(Date.now() / 60000)}`
    const n = await r.incr(key)
    if (n === 1) await r.expire(key, 70)
    if (n > PER_MINUTE) throw new HttpError(429, "rate_limited", "Too many AI requests, wait a minute")

    const s = supabaseAdmin()
    const contact = await getContact(tenantId, waId)
    const rows = must(
      await s.from("messages").select("*").eq("tenant_id", tenantId).eq("thread_id", waId).order("created_at", { ascending: false }).limit(20),
      "load_messages"
    ) as any[]
    const messages = rows.reverse().map(toMessageDTO)
    if (!messages.some(m => m.direction === "in")) throw unprocessable("no_customer_messages", "There's no customer message to reply to yet")
    const { data: sender } = await s.from("whatsapp_credentials").select("verified_name").eq("tenant_id", tenantId).eq("default_sender", true).maybeSingle()

    try {
      const result = await suggestReplies({
        businessName: sender?.verified_name,
        contact: { name: contact.name, company: contact.company, notes: contact.notes, tags: contact.tags, stage: contact.deal?.stage_name },
        messages: messages.map(m => ({ direction: m.direction, text: m.text, created_at: m.created_at, campaign: !!m.campaign_id }))
      })
      await s.from("ai_usage").insert({
        tenant_id: tenantId,
        user_id: req.auth.userId,
        kind: "suggest_replies",
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens
      })
      return { suggestions: result.suggestions }
    } catch (e) {
      if (e instanceof AiError) {
        req.log.warn({ code: e.code, tenant_id: tenantId }, "ai_suggest_failed")
        throw new HttpError(e.code === "ai_rate_limited" ? 429 : e.code === "ai_declined" ? 422 : 503, e.code, e.message)
      }
      throw e
    }
  })
}
