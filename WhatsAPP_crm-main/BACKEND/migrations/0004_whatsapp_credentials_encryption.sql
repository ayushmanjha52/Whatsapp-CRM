alter table whatsapp_credentials
  add column if not exists access_token_encrypted text,
  add column if not exists last_scope_check_at timestamptz;

create index if not exists idx_whatsapp_credentials_phone on whatsapp_credentials (phone_number_id);
create index if not exists idx_whatsapp_credentials_waba on whatsapp_credentials (waba_id);

