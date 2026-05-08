export type Env = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE: string
  REDIS_URL: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  DATA_ENCRYPTION_KEY?: string
}

export function getEnv(): Env {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE || "",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY
  }
}

export const Queues = {
  OutboundMessages: "outbound-messages",
  InboundEvents: "inbound-events",
  TemplateSends: "template-sends",
  MediaUploads: "media-uploads",
  AnalyticsSnapshots: "analytics-snapshots"
} as const
