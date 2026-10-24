-- UP : un document rangé vit dans le Drive de la société ; on garde l'identifiant et le lien.
alter table public.documents add column if not exists drive_file_id text;
alter table public.documents add column if not exists drive_url text;
-- DOWN :
-- alter table public.documents drop column if exists drive_url;
-- alter table public.documents drop column if exists drive_file_id;
