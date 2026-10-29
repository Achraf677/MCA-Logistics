-- Flotte : suppression des tables Inspections et Incidents (décision du 22/10/2026, 0 ligne, plus aucun écran ni lecteur).
-- À recréer plus tard selon la réalité du terrain. Non additive : appliquée après accord explicite.
drop table if exists public.incidents;
drop table if exists public.vehicle_inspections;

-- DOWN (en commentaire) : tables vides recréées (policies : voir migrations 20260616190932 et 20261012090000)
-- create table public.incidents (
--   id uuid primary key default gen_random_uuid(),
--   company_id uuid not null references public.companies(id) on delete cascade,
--   vehicle_id uuid references public.vehicles(id) on delete set null,
--   driver_id uuid references public.team_members(id) on delete set null,
--   date date not null, type text check (type in ('accident','panne','vol','vandalisme','infraction','autre')),
--   description text, location text, damage_cts integer, at_fault boolean,
--   status text default 'ouvert' check (status in ('ouvert','en_cours','clos')),
--   police_report boolean default false, insurance_ref text, notes text,
--   created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- create table public.vehicle_inspections (
--   id uuid primary key default gen_random_uuid(),
--   company_id uuid not null references public.companies(id) on delete cascade,
--   vehicle_id uuid not null references public.vehicles(id) on delete cascade,
--   driver_id uuid references public.team_members(id) on delete set null,
--   date date not null, type text check (type in ('pre_trajet','post_trajet','periodique')), mileage_km integer,
--   exterior_ok boolean default true, lights_ok boolean default true, tires_ok boolean default true, brakes_ok boolean default true,
--   fluids_ok boolean default true, docs_ok boolean default true, cleanliness_ok boolean default true,
--   status text default 'ok' check (status in ('ok','defauts','refuse')), defects text, notes text, signed_by text,
--   created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- alter table public.incidents enable row level security; alter table public.vehicle_inspections enable row level security;
