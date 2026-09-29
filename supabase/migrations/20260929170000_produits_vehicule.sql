-- UP
-- Produits personnalisés de « Carburant & liquides ». Les 11 produits de base
-- (diesel … autre_liquide) restent définis dans le code ; cette table ne porte
-- QUE ceux que l'utilisateur ajoute depuis Paramètres. Leur code, stocké dans
-- fuel_logs.fuel_type, est préfixé « x_ » pour ne jamais entrer en collision
-- avec un produit de base.
create table if not exists public.produits_vehicule (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  code        text not null check (code ~ '^x_[a-z0-9_]{1,40}$'),
  libelle     text not null check (length(trim(libelle)) between 1 and 60),
  famille     text not null check (famille in ('carburant', 'liquide')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);

alter table public.produits_vehicule enable row level security;

create policy "produits_vehicule_select_own" on public.produits_vehicule
  for select using (company_id = (select company_id from public.profiles where id = auth.uid()));
create policy "produits_vehicule_insert_own" on public.produits_vehicule
  for insert with check (company_id = (select company_id from public.profiles where id = auth.uid()));
create policy "produits_vehicule_update_own" on public.produits_vehicule
  for update using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- Les pleins acceptent aussi les codes personnalisés « x_… ».
alter table public.fuel_logs drop constraint if exists fuel_logs_fuel_type_check;
alter table public.fuel_logs add constraint fuel_logs_fuel_type_check
  check (fuel_type = any (array[
    'diesel', 'essence', 'electric', 'hybrid', 'lpg',
    'adblue', 'lave_glace', 'huile_moteur', 'liquide_refroidissement',
    'liquide_frein', 'autre_liquide'
  ]::text[]) or fuel_type ~ '^x_[a-z0-9_]{1,40}$');

-- DOWN
-- alter table public.fuel_logs drop constraint if exists fuel_logs_fuel_type_check;
-- alter table public.fuel_logs add constraint fuel_logs_fuel_type_check
--   check (fuel_type = any (array['diesel','essence','electric','hybrid','lpg','adblue','lave_glace',
--     'huile_moteur','liquide_refroidissement','liquide_frein','autre_liquide']::text[]));
-- drop table if exists public.produits_vehicule;
