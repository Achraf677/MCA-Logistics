-- UP : suivi de l'envoi d'un justificatif validé vers Pennylane (liste « à traiter »).
alter table receipts_inbox add column if not exists pennylane_envoye_le timestamptz;
alter table receipts_inbox add column if not exists pennylane_id text;
alter table receipts_inbox add column if not exists pennylane_erreur text;

-- DOWN (commentaire) :
-- alter table receipts_inbox drop column if exists pennylane_envoye_le, drop column if exists pennylane_id, drop column if exists pennylane_erreur;
