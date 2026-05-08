create table if not exists auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  status text not null default 'active'
);

create index if not exists idx_auth_users_email on auth_users (email);

create table if not exists auth_refresh_tokens (
  id bigserial primary key,
  user_id uuid not null references auth_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  user_agent text,
  ip inet,
  unique (user_id, token_hash)
);

create table if not exists auth_logs (
  id bigserial primary key,
  user_id uuid,
  event text not null,
  success boolean not null,
  reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

