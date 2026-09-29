-- UP
-- Un devis accepté ne transmettait à la livraison créée que les champs
-- financiers (montant/TVA/description) — adresses, chauffeur et véhicule
-- étaient à ressaisir entièrement dans DrawerLivraison. Colonnes additives,
-- nullables : aucun devis existant n'est affecté.
alter table public.quotes
  add column if not exists pickup_address text,
  add column if not exists delivery_address text,
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add column if not exists driver_id uuid references public.team_members(id);

create index if not exists idx_quotes_vehicle_id on public.quotes (vehicle_id);
create index if not exists idx_quotes_driver_id on public.quotes (driver_id);

-- DOWN
-- drop index if exists idx_quotes_driver_id;
-- drop index if exists idx_quotes_vehicle_id;
-- alter table public.quotes
--   drop column if exists driver_id,
--   drop column if exists vehicle_id,
--   drop column if exists delivery_address,
--   drop column if exists pickup_address;
