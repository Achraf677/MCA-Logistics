-- Migration : étend la contrainte justif_type pour les CRÉDITS Qonto.
-- Ajoute client / remboursement / autre aux valeurs autorisées (côté crédit).
-- Les valeurs débit (cca, frais_bancaire, hors_activite) restent valides.
-- La policy qonto_transactions_update_company couvre déjà ce champ.

-- ── UP ────────────────────────────────────────────────────────────────────────

alter table public.qonto_transactions
  drop constraint if exists qonto_transactions_justif_type_check;

alter table public.qonto_transactions
  add constraint qonto_transactions_justif_type_check
  check (
    justif_type in ('cca', 'frais_bancaire', 'hors_activite', 'client', 'remboursement', 'autre')
    or justif_type is null
  );

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- alter table public.qonto_transactions
--   drop constraint if exists qonto_transactions_justif_type_check;
-- alter table public.qonto_transactions
--   add constraint qonto_transactions_justif_type_check
--   check (justif_type in ('cca', 'frais_bancaire', 'hors_activite') or justif_type is null);
