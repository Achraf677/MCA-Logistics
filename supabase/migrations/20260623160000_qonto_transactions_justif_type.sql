-- Migration : tag justif_type sur les débits Qonto (CCA / frais bancaire / hors activité).
-- Permet de sortir ces débits de l'alerte "sans justificatif" sans charge Pennylane associée.
-- La policy UPDATE existante (qonto_transactions_update_company) couvre déjà ce champ.

-- ── UP ────────────────────────────────────────────────────────────────────────

alter table public.qonto_transactions
  add column if not exists justif_type text
  constraint qonto_transactions_justif_type_check
  check (justif_type in ('cca', 'frais_bancaire', 'hors_activite') or justif_type is null);

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- alter table public.qonto_transactions drop column if exists justif_type;
