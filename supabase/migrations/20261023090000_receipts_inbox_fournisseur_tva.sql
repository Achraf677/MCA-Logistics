-- UP : ce que Pennylane exige pour importer une facture fournisseur « à traiter » : un fournisseur et la TVA.
-- Renseignés par le bureau dans le tiroir du justificatif avant « Valider et envoyer à Pennylane ».
alter table receipts_inbox add column if not exists supplier_id uuid references suppliers(id) on delete set null;
alter table receipts_inbox add column if not exists tva_rate numeric;

-- DOWN (commentaire) :
-- alter table receipts_inbox drop column if exists supplier_id, drop column if exists tva_rate;
