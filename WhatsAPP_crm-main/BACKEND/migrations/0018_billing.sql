-- 0018: Stripe subscriptions, plan limits and AI settings. Idempotent.

alter table public.tenants
  add column if not exists plan text not null default 'starter',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_plan_check') then
    alter table public.tenants add constraint tenants_plan_check check (plan in ('starter', 'growth', 'business'));
  end if;
end $$;

create unique index if not exists ux_tenants_stripe_customer on public.tenants (stripe_customer_id) where stripe_customer_id is not null;

-- Each Stripe event is processed once, even when Stripe retries delivery.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

-- Conversations this calendar month (UTC): distinct chats with at least one message.
create or replace function public.crm_conversations_this_month(p_tenant text)
returns integer
language sql
stable
as $$
  select count(distinct thread_id)::int
  from public.messages
  where tenant_id = p_tenant and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
$$;

-- AI reply suggestions: usage log for rate limiting and cost visibility.
create table if not exists public.ai_usage (
  id bigserial primary key,
  tenant_id text not null,
  user_id uuid,
  kind text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_tenant on public.ai_usage (tenant_id, created_at);

alter table public.stripe_events enable row level security;
alter table public.ai_usage enable row level security;

do $$
declare
  r text;
begin
  revoke execute on function public.crm_conversations_this_month(text) from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.crm_conversations_this_month(text) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.crm_conversations_this_month(text) to service_role;
  end if;
end $$;
