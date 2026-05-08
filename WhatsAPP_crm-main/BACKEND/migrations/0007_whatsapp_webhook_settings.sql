create table if not exists public.whatsapp_webhook_settings (
  tenant_id text primary key references tenants(id) on delete cascade,
  verify_token text,
  app_secret text,
  callback_url text,
  subscribed_at timestamptz,
  last_signature_valid_at timestamptz
);

