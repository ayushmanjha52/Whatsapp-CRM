create unique index if not exists ux_whatsapp_default_sender_per_tenant
  on public.whatsapp_credentials(tenant_id)
  where default_sender is true;

