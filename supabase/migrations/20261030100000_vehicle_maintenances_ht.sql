-- Flotte › Entretiens : montants HT / TVA + « HT vérifié ». Additive, nullable (cost_cts = TTC reste écrit).
alter table public.vehicle_maintenances add column if not exists cost_ht_cts integer;
alter table public.vehicle_maintenances add column if not exists tva_cts integer;
alter table public.vehicle_maintenances add column if not exists ht_verifie_le timestamptz;

-- Reprise : une opération = une facture Pennylane → HT et TVA de la facture (source). Aucune n'est « vérifiée » : le président valide ticket par ticket.
update public.vehicle_maintenances m set cost_ht_cts = c.montant_ht_cts, tva_cts = c.tva_cts
  from public.charges c
  where c.id = m.charge_id and c.montant_ht_cts is not null
    and (select count(*) from public.vehicle_maintenances m2 where m2.charge_id = m.charge_id) = 1;

-- DOWN (en commentaire)
-- alter table public.vehicle_maintenances drop column if exists ht_verifie_le;
-- alter table public.vehicle_maintenances drop column if exists tva_cts;
-- alter table public.vehicle_maintenances drop column if exists cost_ht_cts;
