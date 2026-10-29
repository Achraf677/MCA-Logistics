-- Dépenses : moyen « Carte carburant » + quelle carte (société ou carburant). Additive.
alter table public.receipts_inbox drop constraint if exists receipts_inbox_moyen_paiement_check;
alter table public.receipts_inbox add constraint receipts_inbox_moyen_paiement_check
  check (moyen_paiement is null or moyen_paiement in ('carte_societe', 'carte_carburant', 'personnel'));
alter table public.receipts_inbox add column if not exists carte text
  check (carte is null or carte in ('qonto_4103', 'pennylane_4393', 'pennylane_5115', 'pennylane_8784', 'pennylane_8685', 'edenred_9156'));

-- DOWN (en commentaire)
-- alter table public.receipts_inbox drop column if exists carte;
-- alter table public.receipts_inbox drop constraint if exists receipts_inbox_moyen_paiement_check;
-- alter table public.receipts_inbox add constraint receipts_inbox_moyen_paiement_check
--   check (moyen_paiement is null or moyen_paiement in ('carte_societe', 'personnel'));
