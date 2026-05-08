create or replace function public.inc_message_media_count(p_tenant_id text, p_id text)
returns void
language plpgsql
as $$
begin
  update public.messages
  set media_count = coalesce(media_count, 0) + 1,
      has_media = true
  where tenant_id = p_tenant_id and id = p_id;
end;
$$;
