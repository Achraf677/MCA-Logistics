-- UP : adresse de dépôt Pennylane (Paramètres › Transmission des factures) ; les justificatifs validés y sont envoyés par mail.
alter table public.companies add column if not exists pennylane_depot_email text;
-- DOWN (commentaire) : alter table public.companies drop column if exists pennylane_depot_email;
