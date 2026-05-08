alter table public.contacts
  add column if not exists profile_image_url text,
  add column if not exists profile_image_hash text,
  add column if not exists last_profile_image_at timestamptz;
