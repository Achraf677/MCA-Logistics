-- Flotte › Carburant : montant HT du plein (tout en HT sauf la trésorerie). Additive, nullable.
alter table public.fuel_logs add column if not exists total_ht_cts integer;

-- Reprise : plein seul sur sa facture = HT de la facture Pennylane (source) ; plein partagé = TTC − TVA du plein.
update public.fuel_logs f set total_ht_cts = c.montant_ht_cts
  from public.charges c
  where c.id = f.charge_id and c.montant_ht_cts is not null
    and (select count(*) from public.fuel_logs f2 where f2.charge_id = f.charge_id) = 1;
update public.fuel_logs set total_ht_cts = total_cts - tva_cts where total_ht_cts is null and tva_cts is not null;
update public.fuel_logs set total_ht_cts = total_cts where total_ht_cts is null and coalesce(tva_rate, 0) = 0;

-- DOWN (en commentaire)
-- alter table public.fuel_logs drop column if exists total_ht_cts;
