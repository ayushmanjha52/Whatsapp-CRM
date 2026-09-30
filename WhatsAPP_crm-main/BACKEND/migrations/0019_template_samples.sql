-- 0019: remember the sample file of media-header templates created in the app,
-- so broadcasts can offer it as the default header media. Idempotent.
alter table public.templates add column if not exists sample_media_url text;
