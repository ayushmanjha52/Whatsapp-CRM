create table if not exists public.whatsapp_analytics_snapshots (
  id bigserial primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  waba_id text,
  kind text not null,
  time_window text,
  data_json jsonb not null,
  created_at timestamptz default now()
);
