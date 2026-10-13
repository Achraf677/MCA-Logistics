-- Migration : journée de colis du salarié + dépenses (lot S1, plan mca-spec/PLAN-ESPACE-SALARIE.md § 0).
-- Prérequis : 20261012090000_salarie_cloisonnement, 20261012100000_salarie_terrain.
-- Métier (décisions du 12/10/2026) :
--   - chaque jour, pour chaque client du jour (fixé par l'admin dans la fiche Équipe), le
--     salarié déclare : colis livrés à domicile, colis livrés en point relais, colis en litige
--     + raison, photo(s) du compteur de son appareil ; il envoie au bureau ;
--   - l'admin valide (ou corrige, ou refuse avec un motif) ; validée = verrouillée pour le
--     salarié (ni modification, ni suppression) ; toute modification par le bureau d'une
--     journée validée est tracée (historique avant / après, qui, quand, pourquoi) ;
--   - payé au colis : tarif domicile et tarif relais dans la fiche Équipe ;
--   - dépenses : le salarié (ou un associé) photographie un justificatif, indique montant,
--     catégorie, payé avec la carte société ou de sa poche (note de frais), et suit son état.
-- Droits bureau : nouvelle clé de catalogue `equipe.journees` (view / update / delete).
-- Additive et réversible (DOWN en bas). Application MCP : UNE instruction par appel, dans
--   l'ordre (corps de fonction entre apostrophes).

-- UP -------------------------------------------------------------------------

-- 1. Fiche Équipe : tarifs au colis et clients de messagerie du salarié (fixés par l'admin).
alter table public.team_members
  add column if not exists tarif_domicile_cts integer check (tarif_domicile_cts is null or tarif_domicile_cts >= 0),
  add column if not exists tarif_relais_cts integer check (tarif_relais_cts is null or tarif_relais_cts >= 0),
  add column if not exists clients_messagerie uuid[] not null default '{}';

-- 2. Clients de messagerie du compte connecté (lisibles par le salarié).
create or replace function public.mes_clients_messagerie() returns uuid[]
language sql stable security definer set search_path = public
as 'select coalesce((select clients_messagerie from public.team_members where profile_id = auth.uid() limit 1), ''{}''::uuid[])';

-- 3. Le salarié lit aussi le nom de ses clients de messagerie (en plus de ceux de ses courses).
drop policy if exists clients_salarie_ses_courses on public.clients;

create policy clients_salarie_ses_courses on public.clients as restrictive for select to authenticated
  using (not (select public.est_salarie()) or id in (select client_id from public.deliveries)
         or id = any((select public.mes_clients_messagerie())));

-- 4. Journées de colis.
create table if not exists public.journees_colis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  client_id uuid not null references public.clients(id),
  colis_domicile integer not null default 0 check (colis_domicile >= 0),
  colis_relais integer not null default 0 check (colis_relais >= 0),
  colis_litige integer not null default 0 check (colis_litige >= 0),
  litige_raison text,
  note text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoyee', 'validee', 'refusee')),
  domicile_valide integer check (domicile_valide is null or domicile_valide >= 0),
  relais_valide integer check (relais_valide is null or relais_valide >= 0),
  litige_valide integer check (litige_valide is null or litige_valide >= 0),
  motif_refus text,
  motif_modification text,
  envoyee_le timestamptz,
  valide_par uuid references public.profiles(id) on delete set null,
  valide_le timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journees_colis_unique unique (member_id, date, client_id)
);

create index if not exists journees_colis_company_date_idx on public.journees_colis (company_id, date);

alter table public.journees_colis enable row level security;

create policy journees_colis_select on public.journees_colis for select to authenticated
  using (company_id = (select public.current_company_id()) and (
    ((select public.est_salarie()) and member_id = (select public.ma_fiche_equipe()))
    or (not (select public.est_salarie()) and ((select public.is_president())
        or (select public.has_permission('equipe.journees', 'view')) or member_id = (select public.ma_fiche_equipe())))));

create policy journees_colis_insert on public.journees_colis for insert to authenticated
  with check (company_id = (select public.current_company_id()) and (
    (member_id = (select public.ma_fiche_equipe()) and statut in ('brouillon', 'envoyee'))
    or (select public.is_president()) or (select public.has_permission('equipe.journees', 'update'))));

create policy journees_colis_update on public.journees_colis for update to authenticated
  using (company_id = (select public.current_company_id()) and (
    (member_id = (select public.ma_fiche_equipe()) and statut in ('brouillon', 'envoyee', 'refusee'))
    or (select public.is_president()) or (select public.has_permission('equipe.journees', 'update'))))
  with check (company_id = (select public.current_company_id()));

create policy journees_colis_delete on public.journees_colis for delete to authenticated
  using (company_id = (select public.current_company_id()) and (
    (member_id = (select public.ma_fiche_equipe()) and statut in ('brouillon', 'envoyee', 'refusee'))
    or (select public.is_president()) or (select public.has_permission('equipe.journees', 'delete'))));

-- 5. Garde : ce que chacun peut faire, horodatages, historique.
--    Salarié (sans droit `equipe.journees : update`) : jamais une journée validée ; jamais les
--    champs du bureau (validés, motifs, validé par) ; statut seulement brouillon / envoyée ;
--    client parmi ses clients de messagerie. Bureau : valider / refuser / corriger ; corriger
--    une journée DÉJÀ validée exige un motif (historique).
create or replace function public.journees_colis_garde() returns trigger
language plpgsql security definer set search_path = public
as '
declare
  bureau boolean := public.is_president() or public.has_permission(''equipe.journees'', ''update'');
begin
  if tg_op = ''INSERT'' then
    if not bureau then
      if new.statut not in (''brouillon'', ''envoyee'') or new.domicile_valide is not null
         or new.relais_valide is not null or new.litige_valide is not null or new.valide_par is not null then
        raise exception ''Journée : seul le bureau valide.'' using errcode = ''42501'';
      end if;
      if not (new.client_id = any(public.mes_clients_messagerie())) then
        raise exception ''Journée : ce client ne t''''est pas attribué, préviens le bureau.'' using errcode = ''42501'';
      end if;
    end if;
  else
    if not bureau then
      if old.statut = ''validee'' then
        raise exception ''Journée validée : elle ne peut plus être modifiée.'' using errcode = ''42501'';
      end if;
      if new.statut not in (''brouillon'', ''envoyee'')
         or new.domicile_valide is distinct from old.domicile_valide
         or new.relais_valide is distinct from old.relais_valide
         or new.litige_valide is distinct from old.litige_valide
         or new.valide_par is distinct from old.valide_par
         or new.motif_refus is distinct from old.motif_refus
         or new.member_id <> old.member_id or new.company_id <> old.company_id then
        raise exception ''Journée : seul le bureau valide.'' using errcode = ''42501'';
      end if;
      if new.client_id <> old.client_id and not (new.client_id = any(public.mes_clients_messagerie())) then
        raise exception ''Journée : ce client ne t''''est pas attribué.'' using errcode = ''42501'';
      end if;
    elsif old.statut = ''validee'' and (to_jsonb(new) - array[''updated_at'', ''motif_modification''])
          is distinct from (to_jsonb(old) - array[''updated_at'', ''motif_modification''])
          and (coalesce(trim(new.motif_modification), '''') = ''''
               or new.motif_modification is not distinct from old.motif_modification) then
      raise exception ''Journée validée : indique le motif de la modification.'' using errcode = ''22023'';
    end if;
    new.updated_at := now();
  end if;
  if new.statut = ''envoyee'' and (tg_op = ''INSERT'' or old.statut is distinct from ''envoyee'') then
    new.envoyee_le := now();
  end if;
  if new.statut = ''validee'' and (tg_op = ''INSERT'' or old.statut is distinct from ''validee'') then
    new.valide_le := now();
    new.valide_par := auth.uid();
    new.domicile_valide := coalesce(new.domicile_valide, new.colis_domicile);
    new.relais_valide := coalesce(new.relais_valide, new.colis_relais);
    new.litige_valide := coalesce(new.litige_valide, new.colis_litige);
    new.motif_refus := null;
  end if;
  return new;
end';

create trigger journees_colis_garde before insert or update on public.journees_colis
  for each row execute function public.journees_colis_garde();

-- 6. Historique des modifications (validation, correction, refus, suppression).
create table if not exists public.journees_colis_historique (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  journee_id uuid not null,
  action text not null,
  avant jsonb,
  apres jsonb,
  motif text,
  par uuid,
  le timestamptz not null default now()
);

create index if not exists journees_colis_historique_journee_idx on public.journees_colis_historique (journee_id, le);

alter table public.journees_colis_historique enable row level security;

create policy journees_colis_historique_select on public.journees_colis_historique for select to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('equipe.journees', 'view'))
    or journee_id in (select j.id from public.journees_colis j)));

create or replace function public.journees_colis_trace() returns trigger
language plpgsql security definer set search_path = public
as '
declare
  act text;
begin
  if tg_op = ''DELETE'' then
    insert into public.journees_colis_historique (company_id, journee_id, action, avant, motif, par)
    values (old.company_id, old.id, ''suppression'', to_jsonb(old), old.motif_modification, auth.uid());
    return old;
  end if;
  if tg_op = ''INSERT'' then
    act := case when new.statut = ''envoyee'' then ''envoi'' else ''creation'' end;
  elsif new.statut is distinct from old.statut then
    act := case new.statut when ''validee'' then ''validation'' when ''refusee'' then ''refus''
                           when ''envoyee'' then ''envoi'' else ''retour_brouillon'' end;
  elsif (to_jsonb(new) - array[''updated_at'', ''motif_modification''])
        is not distinct from (to_jsonb(old) - array[''updated_at'', ''motif_modification'']) then
    return new;
  elsif old.statut = ''validee'' then
    act := ''correction'';
  else
    return new;
  end if;
  insert into public.journees_colis_historique (company_id, journee_id, action, avant, apres, motif, par)
  values (new.company_id, new.id, act, case when tg_op = ''UPDATE'' then to_jsonb(old) end, to_jsonb(new),
          coalesce(case when tg_op = ''INSERT'' or new.motif_modification is distinct from old.motif_modification
                        then nullif(trim(new.motif_modification), '''') end,
                   case when new.statut = ''refusee'' then new.motif_refus end), auth.uid());
  return new;
end';

create trigger journees_colis_trace after insert or update or delete on public.journees_colis
  for each row execute function public.journees_colis_trace();

-- 7. Photos d'une journée : documents `entity_type = 'journee_colis'`. Le salarié en ajoute /
--    retire tant que sa journée n'est pas validée.
create policy documents_insert_journee on public.documents for insert to authenticated
  with check (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid())
              and entity_type = 'journee_colis'
              and entity_id in (select j.id from public.journees_colis j
                                where j.member_id = (select public.ma_fiche_equipe()) and j.statut <> 'validee'));

create policy documents_delete_journee on public.documents for delete to authenticated
  using (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid())
         and entity_type = 'journee_colis'
         and entity_id in (select j.id from public.journees_colis j
                           where j.member_id = (select public.ma_fiche_equipe()) and j.statut <> 'validee'));

-- Fichier : son déposant l'efface une fois DÉRÉFÉRENCÉ (deleteDocument / suppression de
-- dépense retirent d'abord la ligne, puis le fichier). Un fichier encore indexé ne bouge pas.
create policy documents_storage_delete_proprio on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and owner = (select auth.uid())
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and not exists (select 1 from public.documents d where d.storage_path = objects.name)
         and not exists (select 1 from public.receipts_inbox r where r.storage_path = objects.name));

-- 8. Le salarié lit aussi les documents de SA fiche (permis, visite médicale…).
drop policy if exists documents_salarie_siens on public.documents;

create policy documents_salarie_siens on public.documents as restrictive for select to authenticated
  using (not (select public.est_salarie()) or uploaded_by = (select auth.uid())
         or (entity_type = 'delivery' and entity_id in (select id from public.deliveries))
         or (entity_type = 'team_member' and entity_id = (select public.ma_fiche_equipe())));

-- 9. Dépenses (boîte `receipts_inbox`) : montant, catégorie, moyen de paiement, date, refus.
alter table public.receipts_inbox
  add column if not exists montant_ttc_cts integer check (montant_ttc_cts is null or montant_ttc_cts >= 0),
  add column if not exists categorie text check (categorie is null or categorie in ('carburant', 'peage', 'parking', 'repas', 'entretien', 'fournitures', 'autre')),
  add column if not exists moyen_paiement text check (moyen_paiement is null or moyen_paiement in ('carte_societe', 'personnel')),
  add column if not exists date_depense date,
  add column if not exists motif_refus text;

-- 10. Le déposant corrige / retire sa dépense tant qu'elle n'est pas traitée.
create policy receipts_inbox_update_proprio on public.receipts_inbox for update to authenticated
  using (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid()) and statut = 'a_traiter')
  with check (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid()) and statut = 'a_traiter');

create policy receipts_inbox_delete_proprio on public.receipts_inbox for delete to authenticated
  using (company_id = (select public.current_company_id()) and uploaded_by = (select auth.uid()) and statut = 'a_traiter');

-- DOWN -----------------------------------------------------------------------
-- drop policy if exists receipts_inbox_delete_proprio on public.receipts_inbox;
-- drop policy if exists receipts_inbox_update_proprio on public.receipts_inbox;
-- alter table public.receipts_inbox drop column if exists motif_refus, drop column if exists date_depense,
--   drop column if exists moyen_paiement, drop column if exists categorie, drop column if exists montant_ttc_cts;
-- drop policy if exists documents_salarie_siens on public.documents;
-- create policy documents_salarie_siens on public.documents as restrictive for select to authenticated
--   using (not public.est_salarie() or uploaded_by = auth.uid()
--          or (entity_type = 'delivery' and entity_id in (select id from public.deliveries)));
-- drop policy if exists documents_storage_delete_proprio on storage.objects;
-- drop policy if exists documents_delete_journee on public.documents;
-- drop policy if exists documents_insert_journee on public.documents;
-- drop trigger if exists journees_colis_trace on public.journees_colis;
-- drop function if exists public.journees_colis_trace();
-- drop table if exists public.journees_colis_historique;
-- drop trigger if exists journees_colis_garde on public.journees_colis;
-- drop function if exists public.journees_colis_garde();
-- drop table if exists public.journees_colis;
-- drop policy if exists clients_salarie_ses_courses on public.clients;
-- create policy clients_salarie_ses_courses on public.clients as restrictive for select to authenticated
--   using (not public.est_salarie() or id in (select client_id from public.deliveries));
-- drop function if exists public.mes_clients_messagerie();
-- alter table public.team_members drop column if exists clients_messagerie,
--   drop column if exists tarif_relais_cts, drop column if exists tarif_domicile_cts;
