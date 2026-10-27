-- La zone d'un arrêt de Brumath vient du fichier « Brumath adresses par zone » (table `zones_rues`), plus de la feuille papier
-- ni de l'apprentissage (ancienne règle : la zone lue sur la feuille gagnait, d'où des zones fausses sur la moitié des arrêts).
--   1. rue du fichier dans UNE zone : cette zone, toujours ;
--   2. rue coupée entre deux zones : la zone lue sur la feuille si elle fait partie des zones de la rue, sinon la zone du
--      point le plus proche de la tournée parmi les zones de la rue, sinon la première ;
--   3. rue absente du fichier : sa zone actuelle ; sans zone, la zone de l'arrêt zoné le plus proche (jamais de bloc « Brumath » isolé).
-- Un arrêt sans position garde sa zone actuelle (ou null). Hors Brumath : rien ne change.
create or replace function public.appliquer_zones_tournee(p_tournee uuid) returns integer
language plpgsql security definer set search_path = public as '
declare
  ok boolean;
  n integer := 0;
  m integer;
begin
  select true into ok from public.tournees_colis t
   where t.id = p_tournee and t.company_id = public.current_company_id()
     and (t.member_id = public.ma_fiche_equipe() or public.is_president() or public.has_permission(''planning.tournees'', ''update''));
  if ok is null then return 0; end if;

  with k as (
    select a.id, z.zones from public.tournees_colis_arrets a
      join public.zones_rues z on z.company_id = a.company_id and z.commune_cle = ''brumath''
       and z.rue_cle = trim(regexp_replace(lower(translate(a.rue, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g''))
     where a.tournee_id = p_tournee and cardinality(z.zones) = 1
       and trim(regexp_replace(lower(translate(a.commune, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g'')) = ''brumath'')
  update public.tournees_colis_arrets a set zone = k.zones[1]
    from k where a.id = k.id and a.zone is distinct from k.zones[1];
  get diagnostics m = row_count; n := n + m;

  with k as (
    select a.id, z.zones from public.tournees_colis_arrets a
      join public.zones_rues z on z.company_id = a.company_id and z.commune_cle = ''brumath''
       and z.rue_cle = trim(regexp_replace(lower(translate(a.rue, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g''))
     where a.tournee_id = p_tournee and cardinality(z.zones) > 1
       and trim(regexp_replace(lower(translate(a.commune, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g'')) = ''brumath'')
  update public.tournees_colis_arrets a set zone = case
      when a.zone = any(k.zones) then a.zone
      else coalesce((select b.zone from public.tournees_colis_arrets b
                      where b.tournee_id = p_tournee and b.id <> a.id and b.zone = any(k.zones) and b.lat is not null and a.lat is not null
                      order by power(b.lat - a.lat, 2) + power((b.lng - a.lng) * 0.66, 2) limit 1), k.zones[1]) end
    from k where a.id = k.id and (a.zone is null or not (a.zone = any(k.zones)));
  get diagnostics m = row_count; n := n + m;

  update public.tournees_colis_arrets a set zone = (
      select b.zone from public.tournees_colis_arrets b
       where b.tournee_id = p_tournee and b.zone is not null and b.lat is not null
         and trim(regexp_replace(lower(translate(b.commune, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g'')) = ''brumath''
       order by power(b.lat - a.lat, 2) + power((b.lng - a.lng) * 0.66, 2) limit 1)
   where a.tournee_id = p_tournee and a.zone is null and a.lat is not null
     and trim(regexp_replace(lower(translate(a.commune, ''àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ'', ''aaaceeeeiioouuuyAAACEEEEIIOOUUU'')), ''[^a-z0-9]+'', '' '', ''g'')) = ''brumath'';
  get diagnostics m = row_count; n := n + m;
  return n;
end';
revoke all on function public.appliquer_zones_tournee(uuid) from public, anon;
grant execute on function public.appliquer_zones_tournee(uuid) to authenticated;
-- DOWN : remettre la version de 20261022100000_referentiel_zone.sql (apprentissage depuis la feuille) + « and r.zones is null ».
