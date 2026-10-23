-- UP : lecture IA du ticket (Edge `lire-ticket`) : ce que l'IA a lu + ce qu'elle a prérempli, et quand.
alter table public.receipts_inbox add column if not exists ocr_lecture jsonb, add column if not exists ocr_lu_le timestamptz;
-- DOWN (commentaire) : alter table public.receipts_inbox drop column if exists ocr_lecture, drop column if exists ocr_lu_le;
