-- Lien charge <-> fuel_log / vehicle_maintenance (rapprochement financier).
-- FK nullable : les pleins cash/manuels (charge_id IS NULL) restent possibles.
-- Index unique partiel : une charge ne se rapproche qu'à UN seul fuel_log
-- (anti-doublon comptable ; NULL != NULL → plusieurs manuels sans blocage).

-- UP
alter table public.fuel_logs
  add column if not exists charge_id uuid
    references public.charges(id) on delete set null;

alter table public.vehicle_maintenances
  add column if not exists charge_id uuid
    references public.charges(id) on delete set null;

create unique index if not exists fuel_logs_charge_uniq
  on public.fuel_logs(charge_id)
  where charge_id is not null;

create unique index if not exists vehicle_maintenances_charge_uniq
  on public.vehicle_maintenances(charge_id)
  where charge_id is not null;

-- DOWN
-- drop index if exists public.fuel_logs_charge_uniq;
-- drop index if exists public.vehicle_maintenances_charge_uniq;
-- alter table public.fuel_logs drop column if exists charge_id;
-- alter table public.vehicle_maintenances drop column if exists charge_id;
