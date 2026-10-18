-- Migration : tournée de colis, lots 2 à 5 (carte, ordre par la route, suivi, preuves, clôture).
-- Prérequis : 20261017090000_tournees_colis.
-- - Ordre de passage calculé sur les routes (Edge `optimiser-tournee-colis`) : `ordre` / `eta_min`
--   par arrêt, `depart` / `arrivee` / `trajet` sur la tournée. `rang` reste l'ordre de la
--   feuille, jamais modifié.
-- - Arrêt placé à la main sur la carte : `geo_precision = 'manuel'`.
-- - Clôture par le livreur (lot 4) : `cloturee_le` / `cloturee_par` ; le salarié peut passer SA
--   tournée en `cloturee` (plus rien n'est modifiable ensuite, sauf réouverture par le bureau).
-- - Suivi en direct (lot 3) : `positions_livreurs` = DERNIÈRE position seulement (pas
--   d'historique), envoyée par le livreur pendant SA tournée en cours, s'il l'active.
-- - Preuve photo par arrêt (lot 4) : `documents.entity_type = 'arret_colis'`.
-- Additive. Application MCP : un bloc par appel (corps de fonction entre apostrophes).

-- UP -------------------------------------------------------------------------

alter table public.tournees_colis
  add column if not exists depart jsonb,
  add column if not exists arrivee jsonb,
  add column if not exists ordre_mode text not null default 'feuille',
  add column if not exists ordre_calcule_le timestamptz,
  add column if not exists trajet jsonb,
  add column if not exists cloturee_le timestamptz,
  add column if not exists cloturee_par uuid references public.profiles(id) on delete set null;

alter table public.tournees_colis
  add constraint tournees_colis_ordre_mode_check check (ordre_mode in ('feuille', 'route', 'manuel'));

alter table public.tournees_colis_arrets
  add column if not exists ordre integer,
  add column if not exists eta_min integer check (eta_min is null or eta_min >= 0);

alter table public.tournees_colis_arrets drop constraint if exists tournees_colis_arrets_geo_precision_check;

alter table public.tournees_colis_arrets
  add constraint tournees_colis_arrets_geo_precision_check
  check (geo_precision is null or geo_precision in ('numero', 'rue', 'manuel'));

create index if not exists tournees_colis_arrets_tournee_ordre_idx on public.tournees_colis_arrets (tournee_id, ordre);

-- Le livreur clôture SA tournée : la vérification d'écriture accepte `cloturee` pour lui.
alter policy tournees_colis_update on public.tournees_colis
  with check (company_id = (select public.current_company_id())
    and member_id in (select tm.id from public.team_members tm where tm.company_id = (select public.current_company_id()))
    and (client_id is null or client_id in (select k.id from public.clients k where k.company_id = (select public.current_company_id())))
    and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (member_id = (select public.ma_fiche_equipe()) and statut in ('a_faire', 'en_cours', 'cloturee')
        and (client_id is null or (select public.mes_clients_messagerie()) @> array[client_id]))));

-- Clôture horodatée par la base ; réouverture = efface la clôture.
create or replace function public.tournees_colis_touch() returns trigger
language plpgsql set search_path = public
as '
begin
  new.updated_at := now();
  if new.statut = ''cloturee'' and old.statut is distinct from ''cloturee'' then
    new.cloturee_le := now();
    new.cloturee_par := auth.uid();
  elsif new.statut <> ''cloturee'' then
    new.cloturee_le := null;
    new.cloturee_par := null;
  end if;
  return new;
end';

-- Suivi en direct : une ligne par livreur (sa dernière position).
create table if not exists public.positions_livreurs (
  member_id uuid primary key references public.team_members(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tournee_id uuid references public.tournees_colis(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  precision_m integer,
  maj_le timestamptz not null default now()
);

alter table public.positions_livreurs enable row level security;

create policy positions_livreurs_select on public.positions_livreurs for select to authenticated
  using (company_id = (select public.current_company_id()) and (
    member_id = (select public.ma_fiche_equipe())
    or (not (select public.est_salarie()) and ((select public.is_president())
        or (select public.has_permission('planning.tournees', 'view'))))));

create policy positions_livreurs_insert on public.positions_livreurs for insert to authenticated
  with check (company_id = (select public.current_company_id()) and member_id = (select public.ma_fiche_equipe()));

create policy positions_livreurs_update on public.positions_livreurs for update to authenticated
  using (company_id = (select public.current_company_id()) and member_id = (select public.ma_fiche_equipe()))
  with check (company_id = (select public.current_company_id()) and member_id = (select public.ma_fiche_equipe()));

create policy positions_livreurs_delete on public.positions_livreurs for delete to authenticated
  using (company_id = (select public.current_company_id()) and member_id = (select public.ma_fiche_equipe()));

-- Preuve photo d'un arrêt : le livreur indexe une photo sur un arrêt de SA tournée non clôturée.
create policy documents_insert_arret_colis on public.documents for insert to authenticated
  with check (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid())
              and entity_type = 'arret_colis'
              and entity_id in (select a.id from public.tournees_colis_arrets a
                                join public.tournees_colis t on t.id = a.tournee_id
                                where t.member_id = (select public.ma_fiche_equipe()) and t.statut <> 'cloturee'));

-- … et la lit (en plus de ce qu'il a déposé) : photos des arrêts de ses tournées.
alter policy documents_salarie_siens on public.documents
  using (not (select public.est_salarie()) or uploaded_by = (select auth.uid())
         or (entity_type = 'delivery' and entity_id in (select id from public.deliveries))
         or (entity_type = 'team_member' and entity_id = (select public.ma_fiche_equipe()))
         or (entity_type = 'arret_colis' and entity_id in (select a.id from public.tournees_colis_arrets a)));

-- DOWN -----------------------------------------------------------------------
-- alter policy documents_salarie_siens on public.documents
--   using (not (select public.est_salarie()) or uploaded_by = (select auth.uid())
--          or (entity_type = 'delivery' and entity_id in (select id from public.deliveries))
--          or (entity_type = 'team_member' and entity_id = (select public.ma_fiche_equipe())));
-- drop policy if exists documents_insert_arret_colis on public.documents;
-- drop table if exists public.positions_livreurs;
-- (fonction tournees_colis_touch : reprendre la version de 20261017090000)
-- alter policy tournees_colis_update ... (reprendre la version de 20261017090000, sans 'cloturee')
-- drop index if exists tournees_colis_arrets_tournee_ordre_idx;
-- alter table public.tournees_colis_arrets drop constraint if exists tournees_colis_arrets_geo_precision_check;
-- alter table public.tournees_colis_arrets add constraint tournees_colis_arrets_geo_precision_check
--   check (geo_precision is null or geo_precision in ('numero', 'rue'));
-- alter table public.tournees_colis_arrets drop column if exists eta_min, drop column if exists ordre;
-- alter table public.tournees_colis drop constraint if exists tournees_colis_ordre_mode_check;
-- alter table public.tournees_colis drop column if exists cloturee_par, drop column if exists cloturee_le,
--   drop column if exists trajet, drop column if exists ordre_calcule_le, drop column if exists ordre_mode,
--   drop column if exists arrivee, drop column if exists depart;
