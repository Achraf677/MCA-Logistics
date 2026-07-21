-- Migration : traçage de l'envoi email de la facture au client
-- Objectif   : mémoriser quand la facture (+ BL) a été envoyée par email au
--              client, pour afficher un indicateur "Envoyée le …" et éviter les
--              doublons involontaires.
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive, nullable — aucune donnée existante modifiée.

alter table public.deliveries
  add column if not exists email_sent_at timestamptz null;

comment on column public.deliveries.email_sent_at is
  'Horodatage du dernier envoi email (facture Pennylane + BL) au client via
   l''Edge send-client-email. NULL = jamais envoyé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   alter table public.deliveries drop column if exists email_sent_at;
