alter table contacts
  add constraint contacts_tenant_wa_unique unique (tenant_id, wa_id);

