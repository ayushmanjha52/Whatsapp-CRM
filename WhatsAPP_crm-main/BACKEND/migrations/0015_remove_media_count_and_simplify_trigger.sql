alter table public.messages
  drop column if exists media_count;

create or replace function public.message_media_after_insert()
returns trigger
language plpgsql
as $$
begin
  update public.messages
  set has_media = true
  where tenant_id = NEW.tenant_id and id = NEW.message_id;
  return NEW;
end;
$$;

drop trigger if exists message_media_after_insert on public.message_media;
create trigger message_media_after_insert
after insert on public.message_media
for each row
execute procedure public.message_media_after_insert();
