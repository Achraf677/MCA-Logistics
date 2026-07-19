-- Migration : table charge_allocations (fondation "1 justif → N allocations")
-- Objectif   : permettre "1 charge = plusieurs allocations partielles" (ex :
--              20 € Éléphant Bleu = 10 € AdBlue + 10 € lave-glace) et,
--              symétriquement, "1 cible = N charges" (mouvement 100 € couvrant
--              3 factures). Le "reste" à rapprocher est dérivé côté app.
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive. Rétrocompat : les colonnes existantes charge_id des 3 tables
-- cibles RESTENT en place — le BACKFILL insère une allocation "montant plein"
-- pour chaque lien existant, sans toucher aux données.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Table
create table if not exists public.charge_allocations (
  id            uuid primary key default gen_random_uuid(),
  charge_id     uuid not null references public.charges(id) on delete cascade,
  target_table  text not null check (target_table in
                   ('qonto_transactions','fuel_logs','vehicle_maintenances')),
  target_id     uuid not null,
  amount_cts    integer not null check (amount_cts > 0),
  note          text,
  created_at    timestamptz not null default now()
);

comment on table public.charge_allocations is
  'Allocation partielle d''une charge à une cible (mouvement Qonto, fuel_log ou
   entretien). Une charge peut être split en N allocations. Une même cible peut
   être couverte par N charges. Le reste = montant total − Σ allocations,
   calculé côté application via chargeResteCts / targetCouvertureCts.';

comment on column public.charge_allocations.target_table is
  'Nom de la table cible (référence "polymorphe" via CHECK). target_id est l''uuid
   de la ligne cible correspondante.';

comment on column public.charge_allocations.amount_cts is
  'Fraction de la charge affectée à cette cible, en centimes. Toujours > 0.
   La somme des allocations d''une charge ne doit pas dépasser son montant TTC
   (invariant applicatif, pas contraint en DB pour permettre les corrections).';

create index if not exists idx_charge_allocations_charge
  on public.charge_allocations(charge_id);

create index if not exists idx_charge_allocations_target
  on public.charge_allocations(target_table, target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS — alignée sur charges (accès par company via jointure)
alter table public.charge_allocations enable row level security;

-- SELECT : même règle que charges_select_own (via la charge liée).
create policy "charge_allocations_select_own"
  on public.charge_allocations
  for select
  using (
    exists (
      select 1 from public.charges c
      where c.id = charge_allocations.charge_id
        and c.company_id = (
          select p.company_id from public.profiles p
          where p.id = auth.uid()
        )
    )
  );

-- INSERT / UPDATE / DELETE : même règle que charges (dg / president / comptable).
create policy "charge_allocations_insert_dg_president_comptable"
  on public.charge_allocations
  for insert
  with check (
    exists (
      select 1 from public.charges c
      where c.id = charge_allocations.charge_id
        and c.company_id = (
          select p.company_id from public.profiles p
          where p.id = auth.uid()
        )
    )
    and (
      select p.role from public.profiles p
      where p.id = auth.uid()
    ) = any (array['president','dg','comptable'])
  );

create policy "charge_allocations_update_dg_president_comptable"
  on public.charge_allocations
  for update
  using (
    exists (
      select 1 from public.charges c
      where c.id = charge_allocations.charge_id
        and c.company_id = (
          select p.company_id from public.profiles p
          where p.id = auth.uid()
        )
    )
    and (
      select p.role from public.profiles p
      where p.id = auth.uid()
    ) = any (array['president','dg','comptable'])
  );

create policy "charge_allocations_delete_dg_president_comptable"
  on public.charge_allocations
  for delete
  using (
    exists (
      select 1 from public.charges c
      where c.id = charge_allocations.charge_id
        and c.company_id = (
          select p.company_id from public.profiles p
          where p.id = auth.uid()
        )
    )
    and (
      select p.role from public.profiles p
      where p.id = auth.uid()
    ) = any (array['president','dg','comptable'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) BACKFILL idempotent
-- Pour chaque colonne charge_id != null dans les 3 tables cibles, insérer
-- une allocation "montant plein". amount_cts = montant total DE LA CIBLE
-- (== charge.montant_ttc_cts pour les rapprochements historiques 1-1).
-- WHERE NOT EXISTS : ré-exécution sans doublon.

-- qonto_transactions.charge_id → allocation
insert into public.charge_allocations (charge_id, target_table, target_id, amount_cts, note)
select qt.charge_id, 'qonto_transactions', qt.id, qt.amount_cts,
       'Backfill 20260716130000 : rapprochement 1-1 historique'
from public.qonto_transactions qt
where qt.charge_id is not null
  and qt.amount_cts > 0
  and not exists (
    select 1 from public.charge_allocations ca
    where ca.target_table = 'qonto_transactions'
      and ca.target_id    = qt.id
      and ca.charge_id    = qt.charge_id
  );

-- fuel_logs.charge_id → allocation
insert into public.charge_allocations (charge_id, target_table, target_id, amount_cts, note)
select fl.charge_id, 'fuel_logs', fl.id, coalesce(fl.total_cts, c.montant_ttc_cts, 0),
       'Backfill 20260716130000 : rapprochement 1-1 historique'
from public.fuel_logs fl
join public.charges c on c.id = fl.charge_id
where fl.charge_id is not null
  and coalesce(fl.total_cts, c.montant_ttc_cts, 0) > 0
  and not exists (
    select 1 from public.charge_allocations ca
    where ca.target_table = 'fuel_logs'
      and ca.target_id    = fl.id
      and ca.charge_id    = fl.charge_id
  );

-- vehicle_maintenances.charge_id → allocation
insert into public.charge_allocations (charge_id, target_table, target_id, amount_cts, note)
select vm.charge_id, 'vehicle_maintenances', vm.id, coalesce(vm.cost_cts, c.montant_ttc_cts, 0),
       'Backfill 20260716130000 : rapprochement 1-1 historique'
from public.vehicle_maintenances vm
join public.charges c on c.id = vm.charge_id
where vm.charge_id is not null
  and coalesce(vm.cost_cts, c.montant_ttc_cts, 0) > 0
  and not exists (
    select 1 from public.charge_allocations ca
    where ca.target_table = 'vehicle_maintenances'
      and ca.target_id    = vm.id
      and ca.charge_id    = vm.charge_id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   drop policy if exists "charge_allocations_delete_dg_president_comptable" on public.charge_allocations;
--   drop policy if exists "charge_allocations_update_dg_president_comptable" on public.charge_allocations;
--   drop policy if exists "charge_allocations_insert_dg_president_comptable" on public.charge_allocations;
--   drop policy if exists "charge_allocations_select_own" on public.charge_allocations;
--   drop index if exists public.idx_charge_allocations_target;
--   drop index if exists public.idx_charge_allocations_charge;
--   drop table if exists public.charge_allocations;
--
-- Perte de données : toutes les allocations (dont le backfill) sont perdues.
-- Les colonnes charge_id des 3 tables cibles restent — le rapprochement 1-1
-- reste opérationnel.
