-- ARCHIVE : déjà appliquée en prod. Ne pas relancer via db push.
alter table public.documents
  add column drive_file_id text,
  add column drive_link    text,
  alter column storage_path drop not null;

comment on column public.documents.drive_file_id is 'ID du fichier dans Google Drive (source de vérité du stockage)';
comment on column public.documents.drive_link is 'webViewLink Google Drive pour ouvrir/visualiser le fichier';
comment on column public.documents.storage_path is 'LEGACY Supabase Storage — conservé pour anciens docs, plus utilisé pour les nouveaux';
