import { redis } from "./queue"

export type RealtimeEvent =
  | "message.created"
  | "message.updated"
  | "conversation.updated"
  | "contact.updated"
  | "deal.created"
  | "deal.updated"
  | "deal.deleted"
  | "campaign.updated"
  | "template.updated"
  | "task.due"
  | "task.updated"

export const TENANT_CHANNEL_PATTERN = "tenant:*:events"

export function tenantChannel(tenantId: string): string {
  return `tenant:${tenantId}:events`
}

export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`
}

/** Publishes to Redis; the gateway relays it to every socket in the tenant's room. Never throws. */
export async function publish(tenantId: string, event: RealtimeEvent, data: Record<string, unknown> = {}) {
  try {
    await redis().publish(tenantChannel(tenantId), JSON.stringify({ event, ...data, ts: Date.now() }))
  } catch (e: any) {
    console.error(JSON.stringify({ event: "realtime_publish_failed", tenant_id: tenantId, name: event, message: e?.message }))
  }
}
