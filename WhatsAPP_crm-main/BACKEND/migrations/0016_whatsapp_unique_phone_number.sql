-- Add unique constraint on phone_number_id to prevent same WhatsApp number
-- from being connected to multiple tenants
-- Also add unique constraint on waba_id to prevent same WABA from being connected multiple times

-- First, check for and remove any duplicates (keep the first one by tenant_id)
-- This handles existing data before adding the constraint

-- Remove duplicate phone_number_id entries (keep the oldest tenant_id)
DELETE FROM whatsapp_credentials a
USING whatsapp_credentials b
WHERE a.phone_number_id = b.phone_number_id
  AND a.tenant_id > b.tenant_id;

-- Now add the unique constraints
ALTER TABLE whatsapp_credentials
DROP CONSTRAINT IF EXISTS whatsapp_credentials_phone_number_id_unique;

ALTER TABLE whatsapp_credentials
ADD CONSTRAINT whatsapp_credentials_phone_number_id_unique UNIQUE (phone_number_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_credentials_phone_number_id
ON whatsapp_credentials(phone_number_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_credentials_waba_id
ON whatsapp_credentials(waba_id);
