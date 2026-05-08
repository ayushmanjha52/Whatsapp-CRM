-- Pipeline enhancements migration
-- Add unique constraint on pipeline_stages for tenant_id + name
create unique index if not exists idx_pipeline_stages_tenant_name
  on pipeline_stages(tenant_id, name);

-- Add index on deals for faster queries
create index if not exists idx_deals_tenant
  on deals(tenant_id);

create index if not exists idx_deals_contact
  on deals(contact_id);

create index if not exists idx_deals_stage
  on deals(stage_id);

-- Add unique constraint on contacts for tenant_id + wa_id
create unique index if not exists idx_contacts_tenant_waid
  on contacts(tenant_id, wa_id);

-- Add created_at and updated_at columns to deals if not exist
alter table deals add column if not exists created_at timestamptz default now();
alter table deals add column if not exists updated_at timestamptz default now();

-- Add company field to contacts if not exist
alter table contacts add column if not exists company text;
alter table contacts add column if not exists profile_image_url text;

-- Add hidden_from_inbox for soft-delete from inbox (keeps messages for history)
alter table contacts add column if not exists hidden_from_inbox boolean default false;
