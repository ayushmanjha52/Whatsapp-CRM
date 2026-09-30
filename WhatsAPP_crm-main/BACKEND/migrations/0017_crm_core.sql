-- 0017: CRM core — conversation state on contacts, delivery tracking, campaigns,
-- templates, tasks, team members, and the atomic functions the workers call.
-- Idempotent: safe to re-run.

-- Passwords live only in Supabase Auth; the app no longer keeps its own hash.
alter table public.auth_users alter column password_hash drop not null;

-- ============================================================
-- Contacts: CRM fields + denormalized conversation state
-- ============================================================
alter table public.contacts
  add column if not exists email text,
  add column if not exists notes text not null default '',
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists in_inbox boolean not null default true,
  add column if not exists archived boolean not null default false,
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_direction text,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists opted_out boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.contacts add column if not exists hidden_from_inbox boolean default false;
alter table public.contacts alter column tags set default '{}';
update public.contacts set tags = '{}' where tags is null;

update public.contacts c set
  last_message_at = m.created_at,
  last_message_direction = m.direction,
  last_message_preview = left(coalesce(m.payload_json->'text'->>'body', '[' || m.type || ']'), 200)
from (
  select distinct on (tenant_id, thread_id) tenant_id, thread_id, created_at, direction, type, payload_json
  from public.messages
  order by tenant_id, thread_id, created_at desc
) m
where c.tenant_id = m.tenant_id and c.wa_id = m.thread_id and c.last_message_at is null;

update public.contacts c set last_inbound_at = m.last_in
from (
  select tenant_id, thread_id, max(created_at) as last_in
  from public.messages where direction = 'in' group by tenant_id, thread_id
) m
where c.tenant_id = m.tenant_id and c.wa_id = m.thread_id and c.last_inbound_at is null;

-- Hidden conversations and broadcast imports that never replied stay out of the Inbox.
update public.contacts set in_inbox = false
  where hidden_from_inbox is true or (origin = 'broadcast' and last_inbound_at is null);

create index if not exists idx_contacts_inbox
  on public.contacts (tenant_id, in_inbox, archived, last_message_at desc);
create index if not exists idx_contacts_tags on public.contacts using gin (tags);

-- ============================================================
-- Messages: stable internal id + WhatsApp id (wamid), errors, campaign link
-- ============================================================
alter table public.messages
  add column if not exists wamid text,
  add column if not exists error jsonb,
  add column if not exists campaign_id bigint,
  add column if not exists sent_by uuid,
  add column if not exists updated_at timestamptz default now();

update public.messages set wamid = id where wamid is null and id like 'wamid.%';

create unique index if not exists ux_messages_wamid on public.messages (wamid) where wamid is not null;
create index if not exists idx_messages_thread on public.messages (tenant_id, thread_id, created_at desc);
create index if not exists idx_messages_tenant_created on public.messages (tenant_id, created_at);

-- Status webhooks can arrive before the worker has recorded the wamid; park them here.
create table if not exists public.message_status_pending (
  wamid text primary key,
  tenant_id text not null,
  status text not null,
  status_at timestamptz not null,
  error jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Pipeline
-- ============================================================
alter table public.deals
  add column if not exists title text,
  add column if not exists stage_changed_at timestamptz default now(),
  add column if not exists converted_at timestamptz;

-- ============================================================
-- Templates (mirrors Meta message templates)
-- ============================================================
alter table public.templates
  add column if not exists meta_id text,
  add column if not exists components jsonb not null default '[]'::jsonb,
  add column if not exists parameter_format text,
  add column if not exists rejected_reason text,
  add column if not exists updated_at timestamptz not null default now();

delete from public.templates a using public.templates b
  where a.tenant_id = b.tenant_id and a.name = b.name
    and a.language is not distinct from b.language and a.id < b.id;

create unique index if not exists ux_templates_tenant_name_lang on public.templates (tenant_id, name, language);

-- ============================================================
-- Campaigns
-- ============================================================
alter table public.campaigns
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists variables jsonb not null default '{}'::jsonb,
  add column if not exists header_media_url text,
  add column if not exists phone_number_id text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists parent_campaign_id bigint references public.campaigns(id) on delete set null,
  add column if not exists created_by uuid,
  add column if not exists last_error text,
  add column if not exists created_at timestamptz not null default now();

update public.campaigns set status = 'draft' where status is null;
alter table public.campaigns alter column status set default 'draft';
create index if not exists idx_campaigns_tenant on public.campaigns (tenant_id, created_at desc);

alter table public.campaign_messages
  add column if not exists tenant_id text,
  add column if not exists message_id text,
  add column if not exists error jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

update public.campaign_messages set status = 'pending' where status is null;
alter table public.campaign_messages alter column status set default 'pending';

create unique index if not exists ux_campaign_messages_campaign_contact
  on public.campaign_messages (campaign_id, contact_id);
create index if not exists idx_campaign_messages_message on public.campaign_messages (message_id);
create index if not exists idx_campaign_messages_contact
  on public.campaign_messages (tenant_id, contact_id, sent_at desc);
create index if not exists idx_campaign_messages_status on public.campaign_messages (campaign_id, status);

create or replace view public.campaign_stats with (security_invoker = true) as
select
  campaign_id,
  count(*)::int as total,
  count(*) filter (where status in ('pending', 'queued'))::int as pending,
  count(*) filter (where sent_at is not null)::int as sent,
  count(*) filter (where delivered_at is not null or read_at is not null)::int as delivered,
  count(*) filter (where read_at is not null)::int as read,
  count(*) filter (where status = 'failed')::int as failed,
  count(*) filter (where replied_at is not null)::int as replied
from public.campaign_messages
group by campaign_id;

-- ============================================================
-- Follow-up tasks / reminders
-- ============================================================
create table if not exists public.tasks (
  id bigserial primary key,
  tenant_id text not null,
  contact_id bigint references public.contacts(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_tenant_due on public.tasks (tenant_id, completed_at, due_at);
create index if not exists idx_tasks_contact on public.tasks (contact_id);

-- ============================================================
-- Team members (tenant_id = the owning admin's user id for existing tenants)
-- ============================================================
create table if not exists public.tenant_members (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id uuid,
  email text not null,
  name text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists idx_tenant_members_user on public.tenant_members (user_id);
create index if not exists idx_tenant_members_email on public.tenant_members (lower(email));

insert into public.tenant_members (tenant_id, user_id, email, name, role, status)
select t.id, u.id, lower(u.email), u.name, 'admin', 'active'
from public.tenants t
join public.auth_users u on u.id::text = t.id
on conflict (tenant_id, email) do nothing;

-- ============================================================
-- Functions
-- ============================================================

-- Delivery statuses only move forward: queued < sent < failed < delivered < read.
create or replace function public.crm_status_rank(p_status text)
returns integer
language sql
immutable
as $$
  select case p_status
    when 'pending' then -1
    when 'queued' then 0
    when 'received' then 0
    when 'sent' then 10
    when 'failed' then 15
    when 'delivered' then 20
    when 'read' then 30
    else 0
  end
$$;

-- Records one inbound WhatsApp message and updates the conversation atomically.
-- Idempotent on the WhatsApp message id: webhook retries are ignored.
create or replace function public.crm_ingest_inbound_message(
  p_tenant text,
  p_wa_id text,
  p_profile_name text,
  p_message_id text,
  p_type text,
  p_payload jsonb,
  p_preview text,
  p_at timestamptz,
  p_conversation_id text
) returns jsonb
language plpgsql
as $$
declare
  v_msg_id text;
  v_contact_id bigint;
  v_campaign_id bigint;
  v_body text;
begin
  insert into public.messages (id, wamid, tenant_id, thread_id, direction, type, payload_json, status, conversation_id, created_at)
  values (p_message_id, p_message_id, p_tenant, p_wa_id, 'in', p_type, p_payload, 'received', p_conversation_id, p_at)
  on conflict do nothing
  returning id into v_msg_id;

  if v_msg_id is null then
    select id into v_contact_id from public.contacts where tenant_id = p_tenant and wa_id = p_wa_id;
    return jsonb_build_object('inserted', false, 'contact_id', v_contact_id);
  end if;

  insert into public.contacts as c (
    tenant_id, wa_id, origin, display_name, phone_e164, in_inbox, archived, unread_count,
    last_message_at, last_message_preview, last_message_direction, last_inbound_at
  ) values (
    p_tenant, p_wa_id, 'inbox', coalesce(nullif(p_profile_name, ''), p_wa_id), '+' || p_wa_id, true, false, 1,
    p_at, p_preview, 'in', p_at
  )
  on conflict (tenant_id, wa_id) do update set
    display_name = case
      when c.display_name is null or c.display_name = '' or c.display_name = c.wa_id
        then coalesce(nullif(excluded.display_name, ''), c.display_name)
      else c.display_name end,
    in_inbox = true,
    archived = false,
    hidden_from_inbox = false,
    unread_count = c.unread_count + 1,
    last_message_preview = case when p_at >= coalesce(c.last_message_at, '-infinity'::timestamptz) then p_preview else c.last_message_preview end,
    last_message_direction = case when p_at >= coalesce(c.last_message_at, '-infinity'::timestamptz) then 'in' else c.last_message_direction end,
    last_message_at = greatest(coalesce(c.last_message_at, p_at), p_at),
    last_inbound_at = greatest(coalesce(c.last_inbound_at, p_at), p_at),
    updated_at = now()
  returning id into v_contact_id;

  -- Attribute the reply to the most recent campaign message sent to this contact in the last 7 days.
  update public.campaign_messages cm set replied_at = p_at
  where cm.id = (
    select id from public.campaign_messages
    where tenant_id = p_tenant and contact_id = v_contact_id and sent_at is not null
      and sent_at <= p_at and sent_at > p_at - interval '7 days' and replied_at is null
    order by sent_at desc limit 1
  )
  returning cm.campaign_id into v_campaign_id;

  if p_type = 'text' then
    v_body := upper(trim(coalesce(p_payload->'text'->>'body', '')));
    if v_body in ('STOP', 'UNSUBSCRIBE', 'STOP ALL') then
      update public.contacts set opted_out = true where id = v_contact_id;
    elsif v_body in ('START', 'SUBSCRIBE') then
      update public.contacts set opted_out = false where id = v_contact_id;
    end if;
  end if;

  return jsonb_build_object('inserted', true, 'contact_id', v_contact_id, 'campaign_id', v_campaign_id);
end;
$$;

-- Applies a delivery status webhook to the message and its campaign recipient row.
create or replace function public.crm_apply_message_status(
  p_tenant text,
  p_wamid text,
  p_status text,
  p_at timestamptz,
  p_error jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_msg record;
  v_final text;
begin
  select id, thread_id, status, campaign_id into v_msg
  from public.messages where wamid = p_wamid and tenant_id = p_tenant
  for update;

  if not found then
    insert into public.message_status_pending as p (wamid, tenant_id, status, status_at, error)
    values (p_wamid, p_tenant, p_status, p_at, p_error)
    on conflict (wamid) do update set status = excluded.status, status_at = excluded.status_at, error = excluded.error
      where public.crm_status_rank(excluded.status) > public.crm_status_rank(p.status);
    return jsonb_build_object('found', false);
  end if;

  v_final := v_msg.status;
  if public.crm_status_rank(p_status) > public.crm_status_rank(v_msg.status) then
    v_final := p_status;
    update public.messages set
      status = p_status,
      error = case when p_status = 'failed' then p_error else error end,
      updated_at = now()
    where id = v_msg.id;
  end if;

  update public.campaign_messages set
    status = case when public.crm_status_rank(p_status) > public.crm_status_rank(status) then p_status else status end,
    sent_at = case when p_status in ('sent', 'delivered', 'read') then coalesce(sent_at, p_at) else sent_at end,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end,
    failed_at = case when p_status = 'failed' then coalesce(failed_at, p_at) else failed_at end,
    error = case when p_status = 'failed' then p_error else error end
  where message_id = v_msg.id;

  return jsonb_build_object(
    'found', true, 'message_id', v_msg.id, 'wa_id', v_msg.thread_id,
    'status', v_final, 'campaign_id', v_msg.campaign_id
  );
end;
$$;

-- Called by the worker once WhatsApp accepted a message; replays statuses that arrived early.
create or replace function public.crm_mark_message_sent(p_message_id text, p_wamid text)
returns jsonb
language plpgsql
as $$
declare
  v_tenant text;
  v_thread text;
  v_campaign bigint;
  v_status text;
  v_pending record;
  v_res jsonb;
begin
  update public.messages set
    wamid = p_wamid,
    status = case when public.crm_status_rank(status) < public.crm_status_rank('sent') then 'sent' else status end,
    error = null,
    updated_at = now()
  where id = p_message_id
  returning tenant_id, thread_id, campaign_id, status into v_tenant, v_thread, v_campaign, v_status;

  if v_tenant is null then
    return jsonb_build_object('found', false);
  end if;

  update public.campaign_messages set
    status = case when public.crm_status_rank(status) < public.crm_status_rank('sent') then 'sent' else status end,
    sent_at = coalesce(sent_at, now())
  where message_id = p_message_id;

  select * into v_pending from public.message_status_pending where wamid = p_wamid;
  if found then
    v_res := public.crm_apply_message_status(v_tenant, p_wamid, v_pending.status, v_pending.status_at, v_pending.error);
    v_status := coalesce(v_res->>'status', v_status);
    delete from public.message_status_pending where wamid = p_wamid;
  end if;

  delete from public.message_status_pending where created_at < now() - interval '1 day';

  return jsonb_build_object('found', true, 'tenant_id', v_tenant, 'wa_id', v_thread, 'status', v_status, 'campaign_id', v_campaign);
end;
$$;

create or replace function public.crm_mark_message_failed(p_message_id text, p_error jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_tenant text;
  v_thread text;
  v_campaign bigint;
begin
  update public.messages set status = 'failed', error = p_error, updated_at = now()
  where id = p_message_id and public.crm_status_rank(status) < public.crm_status_rank('failed')
  returning tenant_id, thread_id, campaign_id into v_tenant, v_thread, v_campaign;

  update public.campaign_messages set status = 'failed', error = p_error, failed_at = coalesce(failed_at, now())
  where message_id = p_message_id and public.crm_status_rank(status) < public.crm_status_rank('failed');

  return jsonb_build_object('found', v_tenant is not null, 'tenant_id', v_tenant, 'wa_id', v_thread, 'campaign_id', v_campaign);
end;
$$;

-- Bulk contact import for broadcast lists. New contacts stay out of the Inbox;
-- existing contacts keep their origin/visibility and get merged fields and tags.
create or replace function public.crm_import_contacts(p_tenant text, p_rows jsonb, p_tags text[])
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  with src as (
    select distinct on (r->>'wa_id')
      r->>'wa_id' as wa_id,
      nullif(trim(r->>'name'), '') as name,
      nullif(trim(r->>'email'), '') as email,
      nullif(trim(r->>'company'), '') as company,
      coalesce(r->'custom_fields', '{}'::jsonb) as cf,
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}') || coalesce(p_tags, '{}') as tags
    from jsonb_array_elements(p_rows) r
    where coalesce(r->>'wa_id', '') <> ''
  ), up as (
    insert into public.contacts as c (tenant_id, wa_id, origin, display_name, phone_e164, email, company, custom_fields, tags, in_inbox)
    select p_tenant, wa_id, 'broadcast', coalesce(name, wa_id), '+' || wa_id, email, company, cf, tags, false from src
    on conflict (tenant_id, wa_id) do update set
      display_name = case when c.display_name is null or c.display_name = c.wa_id then excluded.display_name else c.display_name end,
      email = coalesce(excluded.email, c.email),
      company = coalesce(excluded.company, c.company),
      custom_fields = c.custom_fields || excluded.custom_fields,
      tags = array(select distinct t from unnest(coalesce(c.tags, '{}') || excluded.tags) t),
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where inserted),
    'updated', count(*) filter (where not inserted)
  ) into v_result from up;
  return v_result;
end;
$$;

-- Dashboard aggregates for one tenant since p_since, bucketed by day in p_tz.
create or replace function public.crm_dashboard(p_tenant text, p_since timestamptz, p_tz text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_volume jsonb;
  v_resp jsonb;
  v_pipeline jsonb;
  v_broadcast jsonb;
  v_kpis jsonb;
  v_last_stage bigint;
begin
  with days as (
    select generate_series((p_since at time zone p_tz)::date, (now() at time zone p_tz)::date, interval '1 day')::date as d
  ), vol as (
    select (created_at at time zone p_tz)::date as d,
      count(*) filter (where direction = 'in') as inbound,
      count(*) filter (where direction = 'out') as outbound
    from public.messages
    where tenant_id = p_tenant and created_at >= p_since
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', days.d, 'inbound', coalesce(vol.inbound, 0), 'outbound', coalesce(vol.outbound, 0)) order by days.d), '[]'::jsonb)
  into v_volume
  from days left join vol on vol.d = days.d;

  -- A "turn" starts at an inbound message not preceded by another inbound message in the thread.
  -- Response time is the gap to the next agent (non-campaign) outbound message.
  with ordered as (
    select thread_id, created_at, direction,
      lag(direction) over (partition by thread_id order by created_at) as prev_dir
    from public.messages
    where tenant_id = p_tenant and created_at >= p_since and campaign_id is null
  ), turns as (
    select o.thread_id, o.created_at,
      (select min(m.created_at) from public.messages m
        where m.tenant_id = p_tenant and m.thread_id = o.thread_id and m.direction = 'out'
          and m.campaign_id is null and m.created_at > o.created_at) as replied_at
    from ordered o
    where o.direction = 'in' and o.prev_dir is distinct from 'in'
  ), measured as (
    select extract(epoch from (replied_at - created_at)) as secs, created_at, replied_at from turns
  )
  select jsonb_build_object(
    'turns', count(*),
    'answered', count(secs),
    'avg_seconds', coalesce(round(avg(secs)), 0),
    'within_30m_pct', case when count(*) filter (where secs is not null or created_at < now() - interval '30 minutes') = 0 then null
      else round(100.0 * count(*) filter (where secs <= 1800) / count(*) filter (where secs is not null or created_at < now() - interval '30 minutes')) end,
    'buckets', jsonb_build_array(
      jsonb_build_object('range', '< 5m', 'count', count(*) filter (where secs < 300)),
      jsonb_build_object('range', '5-30m', 'count', count(*) filter (where secs >= 300 and secs < 1800)),
      jsonb_build_object('range', '30m-4h', 'count', count(*) filter (where secs >= 1800 and secs < 14400)),
      jsonb_build_object('range', '4-24h', 'count', count(*) filter (where secs >= 14400 and secs < 86400)),
      jsonb_build_object('range', '> 24h', 'count', count(*) filter (where secs >= 86400 or (secs is null and created_at < now() - interval '24 hours')))
    ),
    'unanswered', count(*) filter (where secs is null)
  ) into v_resp
  from measured;

  select id into v_last_stage from public.pipeline_stages where tenant_id = p_tenant order by ord desc limit 1;

  select jsonb_build_object(
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'count', coalesce(d.cnt, 0), 'value', coalesce(d.val, 0)) order by s.ord)
      from public.pipeline_stages s
      left join (
        select stage_id, count(*) as cnt, sum(coalesce(value, 0)) as val
        from public.deals where tenant_id = p_tenant group by stage_id
      ) d on d.stage_id = s.id
      where s.tenant_id = p_tenant
    ), '[]'::jsonb),
    'total_deals', (select count(*) from public.deals where tenant_id = p_tenant),
    'open_value', (select coalesce(sum(value), 0) from public.deals where tenant_id = p_tenant and stage_id is distinct from v_last_stage),
    'won_value', (select coalesce(sum(value), 0) from public.deals where tenant_id = p_tenant and stage_id = v_last_stage),
    'win_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where stage_id = v_last_stage) / count(*)) end
                 from public.deals where tenant_id = p_tenant),
    'avg_cycle_days', (select round((avg(extract(epoch from (converted_at - created_at))) / 86400)::numeric, 1)
                       from public.deals where tenant_id = p_tenant and stage_id = v_last_stage and converted_at is not null)
  ) into v_pipeline;

  select jsonb_build_object(
    'recipients', count(*),
    'sent', count(*) filter (where sent_at is not null),
    'delivered', count(*) filter (where delivered_at is not null or read_at is not null),
    'read', count(*) filter (where read_at is not null),
    'failed', count(*) filter (where status = 'failed'),
    'replied', count(*) filter (where replied_at is not null)
  ) into v_broadcast
  from public.campaign_messages
  where tenant_id = p_tenant and created_at >= p_since;

  select jsonb_build_object(
    'open_conversations', (select count(*) from public.contacts where tenant_id = p_tenant and in_inbox and not archived),
    'unread_conversations', (select count(*) from public.contacts where tenant_id = p_tenant and in_inbox and not archived and unread_count > 0),
    'messages_in', (select count(*) from public.messages where tenant_id = p_tenant and created_at >= p_since and direction = 'in'),
    'messages_out', (select count(*) from public.messages where tenant_id = p_tenant and created_at >= p_since and direction = 'out'),
    'new_contacts', (select count(*) from public.contacts where tenant_id = p_tenant and created_at >= p_since),
    'tasks_due_today', (select count(*) from public.tasks where tenant_id = p_tenant and completed_at is null
                          and due_at < ((((now() at time zone p_tz)::date + 1)::timestamp) at time zone p_tz)),
    'overdue_tasks', (select count(*) from public.tasks where tenant_id = p_tenant and completed_at is null and due_at < now())
  ) into v_kpis;

  return jsonb_build_object(
    'kpis', v_kpis,
    'volume', v_volume,
    'response', v_resp,
    'pipeline', v_pipeline,
    'broadcast', v_broadcast
  );
end;
$$;

-- ============================================================
-- Security: the backend uses the service role (bypasses RLS). Enabling RLS
-- with no policies stops the public anon key from reading tenant data via PostgREST.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'whatsapp_credentials', 'contacts', 'threads', 'messages', 'pipeline_stages', 'deals',
    'campaigns', 'campaign_messages', 'templates', 'events', 'auth_users', 'auth_refresh_tokens', 'auth_logs',
    'whatsapp_webhook_settings', 'whatsapp_analytics_snapshots', 'message_media', 'message_status_pending',
    'tasks', 'tenant_members'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'public.crm_ingest_inbound_message(text, text, text, text, text, jsonb, text, timestamptz, text)',
    'public.crm_apply_message_status(text, text, text, timestamptz, jsonb)',
    'public.crm_mark_message_sent(text, text)',
    'public.crm_mark_message_failed(text, jsonb)',
    'public.crm_import_contacts(text, jsonb, text[])',
    'public.crm_dashboard(text, timestamptz, text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.campaign_stats from %I', r);
    end if;
  end loop;
end $$;
