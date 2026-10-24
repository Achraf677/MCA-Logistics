-- UP : chemin lisible du fichier rangé dans le Drive (« Achats / Carburant / 2026 »), pour l'historique de l'onglet Documents.
alter table public.documents add column if not exists drive_chemin text;
-- DOWN :
-- alter table public.documents drop column if exists drive_chemin;
