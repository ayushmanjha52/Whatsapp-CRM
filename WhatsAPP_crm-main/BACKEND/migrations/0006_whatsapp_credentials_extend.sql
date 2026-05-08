alter table public.whatsapp_credentials
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists status text,
  add column if not exists quality_rating text,
  add column if not exists account_mode text,
  add column if not exists default_sender boolean default false,
  add column if not exists data_access_expires_at timestamptz;

