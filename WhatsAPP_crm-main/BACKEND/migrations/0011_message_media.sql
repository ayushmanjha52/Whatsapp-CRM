create table if not exists public.message_media (
  id bigserial primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  message_id text not null references messages(id) on delete cascade,
  kind text not null,
  bucket_path text not null,
  stored_url text,
  content_type text,
  size bigint,
  sha256 text,
  created_at timestamptz default now()
);

create index if not exists idx_message_media_tenant_kind
  on public.message_media(tenant_id, kind);

create index if not exists idx_message_media_message_id
  on public.message_media(message_id);

alter table public.messages
  add column if not exists has_media boolean default false,
  add column if not exists media_count integer default 0;
