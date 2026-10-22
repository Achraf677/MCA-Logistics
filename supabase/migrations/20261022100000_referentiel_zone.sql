-- La zone d'une rue de Brumath (« ZONE 3 ») est apprise à chaque feuille lue : elle sert ensuite à remplir
-- les arrêts dont la zone n'a pas été lue (tournée créée avant, ligne mal lue, adresse ajoutée à la main).
alter table referentiel_rues add column if not exists zone text;

create or replace function public.appliquer_zones_tournee(p_tournee uuid) returns integer
language plpgsql security definer set search_path = public as '
declare
  ok boolean;
  n integer := 0;
begin
  select true into ok from public.tournees_colis t
   where t.id = p_tournee and t.company_id = public.current_company_id()
     and (t.member_id = public.ma_fiche_equipe() or public.is_president() or public.has_permission(''planning.tournees'', ''update''));
  if ok is null then return 0; end if;
  update public.referentiel_rues r set zone = z.zone, maj_le = now()
    from (select distinct on (commune, rue) commune, rue, zone from public.tournees_colis_arrets
           where tournee_id = p_tournee and zone is not null order by commune, rue, rang) z
   where r.company_id = public.current_company_id() and r.commune = z.commune and r.rue = z.rue and r.zone is distinct from z.zone;
  update public.tournees_colis_arrets a set zone = r.zone
    from public.referentiel_rues r
   where a.tournee_id = p_tournee and a.zone is null and r.company_id = a.company_id
     and r.commune = a.commune and r.rue = a.rue and r.zone is not null;
  get diagnostics n = row_count;
  return n;
end';
revoke all on function public.appliquer_zones_tournee(uuid) from public, anon;
grant execute on function public.appliquer_zones_tournee(uuid) to authenticated;
-- DOWN
-- drop function public.appliquer_zones_tournee(uuid);
-- alter table referentiel_rues drop column zone;
