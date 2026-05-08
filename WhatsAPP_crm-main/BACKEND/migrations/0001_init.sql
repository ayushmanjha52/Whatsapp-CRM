create table if not exists tenants (
  id text primary key,
  name text not null,
  status text not null default 'active'
);

create table if not exists whatsapp_credentials (
  tenant_id text references tenants(id) on delete cascade,
  waba_id text,
  phone_number_id text,
  access_token_hash text,
  token_expires_at timestamptz,
  scopes text[],
  primary key (tenant_id, phone_number_id)
);

create table if not exists contacts (
  id bigserial primary key,
  tenant_id text not null,
  wa_id text,
  origin text not null,
  display_name text,
  phone_e164 text,
  tags text[]
);

create table if not exists threads (
  id text primary key,
  tenant_id text not null,
  wa_id text not null
);

create table if not exists messages (
  id text primary key,
  tenant_id text not null,
  thread_id text not null,
  direction text not null,
  type text not null,
  payload_json jsonb not null,
  status text,
  conversation_id text,
  created_at timestamptz default now()
);

create table if not exists pipeline_stages (
  id bigserial primary key,
  tenant_id text not null,
  name text not null,
  ord integer not null
);

create table if not exists deals (
  id bigserial primary key,
  tenant_id text not null,
  contact_id bigint references contacts(id) on delete set null,
  stage_id bigint references pipeline_stages(id) on delete set null,
  value numeric,
  notes text,
  tags text[]
);

create table if not exists campaigns (
  id bigserial primary key,
  tenant_id text not null,
  name text not null,
  template_id text,
  audience_filter_json jsonb,
  status text
);

create table if not exists campaign_messages (
  id bigserial primary key,
  campaign_id bigint references campaigns(id) on delete cascade,
  contact_id bigint references contacts(id) on delete set null,
  wamid text,
  status text,
  pricing_json jsonb
);

create table if not exists templates (
  id bigserial primary key,
  tenant_id text not null,
  waba_id text,
  name text not null,
  language text,
  category text,
  status text
);

create table if not exists events (
  id bigserial primary key,
  tenant_id text not null,
  type text not null,
  data_json jsonb not null,
  created_at timestamptz default now()
);

