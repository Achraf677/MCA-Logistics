-- Migration : type "professionnel" + délai de paiement façon Pennylane
-- Objectif   : (1) élargir clients.type pour couvrir les clients pro hors
--              medical/ecommerce/retail ; (2) stocker le délai de paiement
--              sous forme de code lisible (select façon Pennylane), en plus
--              de l'entier payment_terms (jours) déjà utilisé par la logique
--              d'encours/retard — inchangée.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
-- Additive, nullable — aucune donnée existante modifiée. Les clients sans
-- payment_terms_label restent affichés via le payment_terms (int) existant
-- (30 → "30 jours" par défaut côté front).

alter table public.clients drop constraint if exists clients_type_check;
alter table public.clients add constraint clients_type_check
  check (type = any (array['medical', 'ecommerce', 'retail', 'particulier', 'professionnel']));

alter table public.clients
  add column if not exists payment_terms_label text null;

comment on column public.clients.payment_terms_label is
  'Code du délai de paiement affiché (select façon Pennylane) : reception,
   15, 30, 45, 60, 30_fin_mois. NULL = legacy, dérivé de payment_terms (int).
   payment_terms (jours) reste la seule source utilisée par le calcul
   encours/retard — cette colonne est purement d''affichage + calcul
   d''échéance Pennylane (cas "30 jours fin de mois").';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   alter table public.clients drop column if exists payment_terms_label;
--   alter table public.clients drop constraint if exists clients_type_check;
--   alter table public.clients add constraint clients_type_check
--     check (type = any (array['medical', 'ecommerce', 'retail', 'particulier']));
--
-- Perte : nécessite qu'aucun client n'ait type='professionnel' avant rollback
-- (sinon le ADD CONSTRAINT échoue — mettre à jour ces clients d'abord).
