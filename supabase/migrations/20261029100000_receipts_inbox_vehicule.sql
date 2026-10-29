-- Carte carburant : véhicule du plein (une seule carte pour plusieurs véhicules). Additive.
alter table public.receipts_inbox add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists receipts_inbox_carburant_idx on public.receipts_inbox (company_id, date_depense) where moyen_paiement = 'carte_carburant';

-- DOWN (en commentaire)
-- drop index if exists public.receipts_inbox_carburant_idx;
-- alter table public.receipts_inbox drop column if exists vehicle_id;
