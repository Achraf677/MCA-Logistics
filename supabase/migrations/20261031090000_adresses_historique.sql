-- Historique des adresses de tournée de colis : ce que le livreur a corrigé (collecte oui / non,
-- éclatement d'un arrêt en 1 collecte + 1 colis normal). Relu à la lecture d'une feuille pour préremplir.
-- Additive. Écrit par `noter_adresse_arret` / `eclater_arret` (droits de l'appelant, RLS comme les arrêts).

create table if not exists public.adresses_historique (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  commune text not null,
  rue text not null,
  numero text,
  commune_k text generated always as (lower(btrim(commune))) stored,
  rue_k text generated always as (lower(btrim(rue))) stored,
  numero_k text generated always as (upper(replace(coalesce(numero, ''), ' ', ''))) stored,
  collecte integer not null default 0 check (collecte >= 0),
  normal integer not null default 0 check (normal >= 0),
  eclate integer not null default 0 check (eclate >= 0),
  eclate_collecte integer not null default 1 check (eclate_collecte >= 1),
  derniere_le timestamptz not null default now(),
  maj_par uuid default auth.uid() references public.profiles(id) on delete set null
);

create unique index if not exists adresses_historique_cle_idx
  on public.adresses_historique (company_id, commune_k, rue_k, numero_k);

alter table public.adresses_historique enable row level security;

create policy adresses_historique_select on public.adresses_historique for select to authenticated
  using (company_id = (select public.current_company_id()));

create policy adresses_historique_insert on public.adresses_historique for insert to authenticated
  with check (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (select public.ma_fiche_equipe()) is not null));

create policy adresses_historique_update on public.adresses_historique for update to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or (select public.ma_fiche_equipe()) is not null))
  with check (company_id = (select public.current_company_id()));

create policy adresses_historique_delete on public.adresses_historique for delete to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'delete'))));

-- Note une correction sur l'adresse d'un arrêt : 'collecte' (devenu collecte), 'normal' (redevenu colis normal),
-- 'eclate' (séparé en collecte + colis normal ; p_colis_collecte = colis côté collecte).
create or replace function public.noter_adresse_arret(p_arret uuid, p_action text, p_colis_collecte integer default null)
returns void language plpgsql set search_path = public
as '
declare
  a public.tournees_colis_arrets%rowtype;
begin
  if p_action not in (''collecte'', ''normal'', ''eclate'') then
    raise exception ''Action inconnue'';
  end if;
  select * into a from public.tournees_colis_arrets where id = p_arret;
  if not found then
    raise exception ''Arrêt introuvable'';
  end if;
  insert into public.adresses_historique as h (company_id, commune, rue, numero, collecte, normal, eclate, eclate_collecte)
  values (a.company_id, a.commune, a.rue, a.numero,
          case when p_action = ''collecte'' then 1 else 0 end,
          case when p_action = ''normal'' then 1 else 0 end,
          case when p_action = ''eclate'' then 1 else 0 end,
          greatest(1, coalesce(p_colis_collecte, 1)))
  on conflict (company_id, commune_k, rue_k, numero_k) do update set
    collecte = h.collecte + case when p_action = ''collecte'' then 1 else 0 end,
    normal = h.normal + case when p_action = ''normal'' then 1 else 0 end,
    eclate = h.eclate + case when p_action = ''eclate'' then 1 else 0 end,
    eclate_collecte = case when p_action = ''eclate'' then greatest(1, coalesce(p_colis_collecte, 1)) else h.eclate_collecte end,
    derniere_le = now(),
    maj_par = auth.uid();
end';

-- Sépare un arrêt de plusieurs colis en 1 collecte (p_colis_collecte colis) + le reste en colis normal ;
-- le total de colis est conservé. L'arrêt doit être un domicile pas encore traité. Renvoie les deux arrêts.
create or replace function public.eclater_arret(p_arret uuid, p_colis_collecte integer)
returns setof public.tournees_colis_arrets language plpgsql set search_path = public
as '
declare
  a public.tournees_colis_arrets%rowtype;
  nouveau uuid;
begin
  select * into a from public.tournees_colis_arrets where id = p_arret for update;
  if not found then
    raise exception ''Arrêt introuvable'';
  end if;
  if a.statut is not null or a.type <> ''c'' or a.quantite < 2 then
    raise exception ''Cet arrêt ne peut pas être éclaté'';
  end if;
  if p_colis_collecte is null or p_colis_collecte < 1 or p_colis_collecte > a.quantite - 1 then
    raise exception ''Nombre de colis de la collecte invalide'';
  end if;
  update public.tournees_colis_arrets set rang = rang + 1 where tournee_id = a.tournee_id and rang > a.rang;
  insert into public.tournees_colis_arrets
    (tournee_id, company_id, rang, commune, cp, rue, numero, type, quantite, lat, lng, geo_precision,
     ordre, eta_min, rang_habituel, zone, note)
  values
    (a.tournee_id, a.company_id, a.rang + 1, a.commune, a.cp, a.rue, a.numero, ''col'', p_colis_collecte, a.lat, a.lng,
     a.geo_precision, a.ordre, a.eta_min, a.rang_habituel, a.zone, a.note)
  returning id into nouveau;
  update public.tournees_colis_arrets set quantite = a.quantite - p_colis_collecte, colis_remis = null where id = a.id;
  perform public.noter_adresse_arret(a.id, ''eclate'', p_colis_collecte);
  return query select * from public.tournees_colis_arrets where id in (a.id, nouveau) order by rang;
end';

grant execute on function public.noter_adresse_arret(uuid, text, integer) to authenticated;
grant execute on function public.eclater_arret(uuid, integer) to authenticated;

-- DOWN -----------------------------------------------------------------------
-- drop function if exists public.eclater_arret(uuid, integer);
-- drop function if exists public.noter_adresse_arret(uuid, text, integer);
-- drop table if exists public.adresses_historique;
