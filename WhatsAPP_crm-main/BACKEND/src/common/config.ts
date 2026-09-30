export type Env = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE: string
  SUPABASE_ANON_KEY: string
  REDIS_URL: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  DATA_ENCRYPTION_KEY?: string
  META_APP_ID: string
  META_APP_SECRET: string
  GRAPH_API_VERSION: string
  GATEWAY_PORT: number
  WEBHOOK_PORT: number
  FRONTEND_BASE_URL: string
  PUBLIC_WEBHOOK_URL: string
  OAUTH_REDIRECT_URI: string
  COOKIE_SECURE: boolean
  COOKIE_DOMAIN?: string
  CORS_ORIGINS: string[]
  MEDIA_BUCKET: string
}

export function getEnv(): Env {
  // On Render the public URL is known at runtime; use it when nothing more specific is set.
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "")
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
    META_APP_ID: process.env.META_APP_ID || "",
    META_APP_SECRET: process.env.META_APP_SECRET || "",
    GRAPH_API_VERSION: process.env.GRAPH_API_VERSION || "v24.0",
    GATEWAY_PORT: Number(process.env.GATEWAY_PORT || process.env.PORT || 4000),
    WEBHOOK_PORT: Number(process.env.WEBHOOK_PORT || process.env.PORT || 4001),
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || publicBase || "http://localhost:3000",
    PUBLIC_WEBHOOK_URL: process.env.PUBLIC_WEBHOOK_URL || (publicBase ? `${publicBase}/webhooks/whatsapp` : ""),
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || (publicBase ? `${publicBase}/auth/whatsapp/callback` : ""),
    COOKIE_SECURE: process.env.COOKIE_SECURE === "1",
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
    CORS_ORIGINS: (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean),
    MEDIA_BUCKET: process.env.MEDIA_BUCKET || "media"
  }
}

export const env = getEnv()

/** Fails fast at boot when a service is started without the settings it cannot run without. */
export function assertEnv(service: string, keys: (keyof Env)[]) {
  const missing = keys.filter(k => {
    const v = env[k]
    return v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
  })
  if (missing.length > 0) {
    console.error(JSON.stringify({ event: "env_missing", service, missing }))
    throw new Error(`${service}: missing required env ${missing.join(", ")}`)
  }
}

export const Queues = {
  OutboundMessages: "outbound-messages",
  InboundEvents: "inbound-events",
  TemplateSends: "template-sends",
  MediaUploads: "media-uploads",
  AnalyticsSnapshots: "analytics-snapshots",
  CampaignDispatch: "campaign-dispatch",
  Reminders: "reminders"
} as const
