-- Plein saisi à la main : litres × prix au litre = montant TTC (calculé côté site, stocké dans montant_ttc_cts). Additive.
alter table public.pleins_carburant
  add column if not exists litres numeric(8,2) check (litres is null or litres > 0),
  add column if not exists prix_litre numeric(6,3) check (prix_litre is null or prix_litre > 0);

-- DOWN (en commentaire)
-- alter table public.pleins_carburant drop column if exists prix_litre, drop column if exists litres;
