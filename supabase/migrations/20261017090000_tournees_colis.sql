-- Migration : tournée de colis (messagerie Colissimo), lot T1 « socle ».
-- Métier : chaque matin le salarié reçoit une feuille de route papier (tableau « ADRESSES DE
--   LIVRAISON » : District | Rue | Nb Colis | Nb PGEO | N° | CRBT). Il la photographie, le site
--   la lit (Edge `lire-feuille-route`) et en fait une liste d'arrêts : un arrêt = un numéro
--   d'une rue (ou la rue entière si pas de numéro), avec son nombre de colis, son type
--   (c = domicile, rc = point relais, col = collecte) et son statut terrain.
-- Ces arrêts ne sont PAS des `deliveries` : le relevé mensuel de messagerie reste la seule
--   ligne `deliveries` du client. Rien ici n'est lu par la facturation ni par la paie (lots
--   suivants : tri par route, carte, photos, clôture).
-- Droits (fiche Équipe et client toujours de la société de l'appelant) :
--   - salarié : lit et écrit SES tournées (member_id = ma_fiche_equipe()) et leurs arrêts, tant
--     qu'elles ne sont pas clôturées ; il ne clôture pas (statut a_faire / en_cours) ; client
--     parmi ses clients de messagerie ;
--   - bureau : droit `planning.tournees` (view / update / delete) dans sa société, ou président.
-- Additive et réversible (DOWN en bas). Application MCP : UNE instruction par appel, dans
--   l'ordre (corps de fonction entre apostrophes, pas de $$).

-- UP -------------------------------------------------------------------------

-- 1. Tournées de colis (une feuille de route scannée = une tournée).
create table if not exists public.tournees_colis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  client_id uuid references public.clients(id) on delete set null,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'cloturee')),
  entete jsonb,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournees_colis_company_date_idx on public.tournees_colis (company_id, date);

create index if not exists tournees_colis_member_date_idx on public.tournees_colis (member_id, date);

-- 2. Arrêts d'une tournée (ordre de la feuille = `rang`).
create table if not exists public.tournees_colis_arrets (
  id uuid primary key default gen_random_uuid(),
  tournee_id uuid not null references public.tournees_colis(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rang integer not null,
  commune text not null,
  cp text,
  rue text not null,
  numero text,
  type text not null default 'c' check (type in ('c', 'rc', 'col')),
  quantite integer not null default 1 check (quantite >= 1),
  colis_remis integer check (colis_remis is null or colis_remis >= 0),
  lat double precision,
  lng double precision,
  geo_precision text check (geo_precision is null or geo_precision in ('numero', 'rue')),
  statut text check (statut is null or statut in ('livre', 'avise', 'instance', 'refuse', 'npai',
    'adresse', 'acces', 'endommage', 'nonpres', 'rc_remis', 'rc_ferme', 'rc_sature', 'col_ok',
    'col_rien', 'col_nf')),
  statut_le timestamptz,
  statut_par uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournees_colis_arrets_tournee_rang_idx on public.tournees_colis_arrets (tournee_id, rang);

alter table public.tournees_colis enable row level security;

alter table public.tournees_colis_arrets enable row level security;

-- 3. Tournées : RLS.
create policy tournees_colis_select on public.tournees_colis for select to authenticated
  using (company_id = (select public.current_company_id()) and (
    member_id = (select public.ma_fiche_equipe())
    or (not (select public.est_salarie()) and ((select public.is_president())
        or (select public.has_permission('planning.tournees', 'view'))))));

create policy tournees_colis_insert on public.tournees_colis for insert to authenticated
  with check (company_id = (select public.current_company_id())
    and member_id in (select tm.id from public.team_members tm where tm.company_id = (select public.current_company_id()))
    and (client_id is null or client_id in (select k.id from public.clients k where k.company_id = (select public.current_company_id())))
    and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (member_id = (select public.ma_fiche_equipe()) and statut in ('a_faire', 'en_cours')
        and (client_id is null or (select public.mes_clients_messagerie()) @> array[client_id]))));

create policy tournees_colis_update on public.tournees_colis for update to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (member_id = (select public.ma_fiche_equipe()) and statut <> 'cloturee')))
  with check (company_id = (select public.current_company_id())
    and member_id in (select tm.id from public.team_members tm where tm.company_id = (select public.current_company_id()))
    and (client_id is null or client_id in (select k.id from public.clients k where k.company_id = (select public.current_company_id())))
    and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (member_id = (select public.ma_fiche_equipe()) and statut in ('a_faire', 'en_cours')
        and (client_id is null or (select public.mes_clients_messagerie()) @> array[client_id]))));

create policy tournees_colis_delete on public.tournees_colis for delete to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'delete'))
    or (member_id = (select public.ma_fiche_equipe()) and statut <> 'cloturee')));

-- 4. Arrêts : RLS. La sous-requête sur `tournees_colis` applique SA RLS (lecture) : on ne
--    voit que les arrêts des tournées qu'on voit. Écriture : tournée non clôturée pour le
--    salarié ; bureau selon le droit.
create policy tournees_colis_arrets_select on public.tournees_colis_arrets for select to authenticated
  using (company_id = (select public.current_company_id())
         and tournee_id in (select t.id from public.tournees_colis t));

create policy tournees_colis_arrets_insert on public.tournees_colis_arrets for insert to authenticated
  with check (company_id = (select public.current_company_id()) and tournee_id in (
    select t.id from public.tournees_colis t where t.company_id = (select public.current_company_id()) and (
      (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
      or (t.member_id = (select public.ma_fiche_equipe()) and t.statut <> 'cloturee'))));

create policy tournees_colis_arrets_update on public.tournees_colis_arrets for update to authenticated
  using (company_id = (select public.current_company_id()) and tournee_id in (
    select t.id from public.tournees_colis t where t.company_id = (select public.current_company_id()) and (
      (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
      or (t.member_id = (select public.ma_fiche_equipe()) and t.statut <> 'cloturee'))))
  with check (company_id = (select public.current_company_id()) and tournee_id in (
    select t.id from public.tournees_colis t where t.company_id = (select public.current_company_id()) and (
      (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
      or (t.member_id = (select public.ma_fiche_equipe()) and t.statut <> 'cloturee'))));

create policy tournees_colis_arrets_delete on public.tournees_colis_arrets for delete to authenticated
  using (company_id = (select public.current_company_id()) and tournee_id in (
    select t.id from public.tournees_colis t where t.company_id = (select public.current_company_id()) and (
      (select public.is_president()) or (select public.has_permission('planning.tournees', 'delete'))
      or (t.member_id = (select public.ma_fiche_equipe()) and t.statut <> 'cloturee'))));

-- 5. Horodatages : `updated_at` sur les deux tables ; sur un arrêt, `statut_le` / `statut_par`
--    posés par la base quand le statut change (jamais saisis par l'écran) ; `colis_remis`
--    remis à null quand le statut est effacé. La société d'un arrêt = celle de sa tournée.
create or replace function public.tournees_colis_touch() returns trigger
language plpgsql set search_path = public
as '
begin
  new.updated_at := now();
  return new;
end';

create trigger tournees_colis_touch before update on public.tournees_colis
  for each row execute function public.tournees_colis_touch();

create or replace function public.tournees_colis_arrets_garde() returns trigger
language plpgsql security definer set search_path = public
as '
declare
  societe uuid;
begin
  select company_id into societe from public.tournees_colis where id = new.tournee_id;
  if societe is null or societe <> new.company_id then
    raise exception ''Arrêt : la tournée n''''appartient pas à cette société.'' using errcode = ''42501'';
  end if;
  if tg_op = ''UPDATE'' then
    new.updated_at := now();
  end if;
  if new.statut is null then
    new.statut_le := null;
    new.statut_par := null;
    new.colis_remis := null;
  elsif tg_op = ''INSERT'' or new.statut is distinct from old.statut
        or new.colis_remis is distinct from old.colis_remis then
    new.statut_le := now();
    new.statut_par := auth.uid();
  end if;
  if new.colis_remis is not null and new.colis_remis > new.quantite then
    new.colis_remis := new.quantite;
  end if;
  return new;
end';

create trigger tournees_colis_arrets_garde before insert or update on public.tournees_colis_arrets
  for each row execute function public.tournees_colis_arrets_garde();

-- DOWN -----------------------------------------------------------------------
-- drop trigger if exists tournees_colis_arrets_garde on public.tournees_colis_arrets;
-- drop function if exists public.tournees_colis_arrets_garde();
-- drop trigger if exists tournees_colis_touch on public.tournees_colis;
-- drop function if exists public.tournees_colis_touch();
-- drop table if exists public.tournees_colis_arrets;
-- drop table if exists public.tournees_colis;
