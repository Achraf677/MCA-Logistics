-- Migration : référentiel des tournées de colis (repris de l'outil de tournée d'origine).
-- Pour chaque village du secteur : ses rues (nom officiel), la position de chaque numéro,
-- l'ordre habituel du livreur (« le fichier ») et les relais connus. Lu par l'Edge
-- `lire-feuille-route` (commune par le secteur, rue officielle, position, relais) ; à la
-- création, la tournée naît dans l'ordre habituel (`ordre_mode = 'habituel'`).
-- Un arrêt placé à la main (carte) enrichit le référentiel : la prochaine feuille le trouve.
-- Additive. Application MCP : un bloc par appel (corps de fonction entre apostrophes).

-- UP -------------------------------------------------------------------------

create table if not exists public.referentiel_rues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  commune text not null,
  commune_cle text not null,
  rue text not null,
  rue_cle text not null,
  rue_souple text not null,
  rang integer,
  numeros jsonb not null default '{}'::jsonb,
  centre jsonb,
  relais text[] not null default '{}',
  maj_le timestamptz not null default now(),
  unique (company_id, commune_cle, rue_cle)
);

create index if not exists referentiel_rues_company_idx on public.referentiel_rues (company_id, commune_cle);

alter table public.referentiel_rues enable row level security;

create policy referentiel_rues_select on public.referentiel_rues for select to authenticated
  using (company_id = (select public.current_company_id()));

create policy referentiel_rues_ecrire on public.referentiel_rues for all to authenticated
  using (company_id = (select public.current_company_id())
         and ((select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))))
  with check (company_id = (select public.current_company_id())
         and ((select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))));

-- Ordre habituel : place de l'arrêt dans l'ordre du fichier, et nouveau mode d'ordre.
alter table public.tournees_colis_arrets add column if not exists rang_habituel integer;

alter table public.tournees_colis drop constraint if exists tournees_colis_ordre_mode_check;

alter table public.tournees_colis
  add constraint tournees_colis_ordre_mode_check check (ordre_mode in ('feuille', 'habituel', 'route', 'manuel'));

-- Position placée à la main → apprise par le référentiel (rue connue seulement).
create or replace function public.apprendre_position_arret(p_arret uuid) returns void
language plpgsql security definer set search_path = public
as '
declare
  a record;
begin
  select ar.company_id, ar.commune, ar.rue, ar.numero, ar.lat, ar.lng into a
    from public.tournees_colis_arrets ar
    join public.tournees_colis t on t.id = ar.tournee_id
   where ar.id = p_arret
     and ar.company_id = public.current_company_id()
     and ar.geo_precision = ''manuel'' and ar.lat is not null and ar.lng is not null
     and (t.member_id = public.ma_fiche_equipe() or public.is_president()
          or public.has_permission(''planning.tournees'', ''update''));
  if not found or a.numero is null or btrim(a.numero) = '''' then
    return;
  end if;
  update public.referentiel_rues r
     set numeros = r.numeros || jsonb_build_object(upper(replace(a.numero, '' '', '''')), jsonb_build_array(a.lat, a.lng)),
         maj_le = now()
   where r.company_id = a.company_id and r.commune = a.commune and r.rue = a.rue;
end';

revoke all on function public.apprendre_position_arret(uuid) from public, anon;
grant execute on function public.apprendre_position_arret(uuid) to authenticated;

-- DOWN -----------------------------------------------------------------------
-- drop function if exists public.apprendre_position_arret(uuid);
-- alter table public.tournees_colis drop constraint if exists tournees_colis_ordre_mode_check;
-- alter table public.tournees_colis add constraint tournees_colis_ordre_mode_check
--   check (ordre_mode in ('feuille', 'route', 'manuel'));   -- (repasser d'abord les 'habituel' en 'feuille')
-- alter table public.tournees_colis_arrets drop column if exists rang_habituel;
-- drop table if exists public.referentiel_rues;
