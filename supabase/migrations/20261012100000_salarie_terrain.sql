-- Migration : le salarié écrit ce que le terrain exige, et rien d'autre (suite du lot S0,
--   plan mca-spec/PLAN-ESPACE-SALARIE.md ; prérequis : 20261012090000_salarie_cloisonnement).
-- Constat : un compte `chauffeur` (0 permission) ne pouvait RIEN écrire dans Mes courses
--   (`deliveries_update_perm`, `documents_insert_perm`, `tours_update_perm` exigent un droit).
--   À l'inverse, deux tables restaient modifiables par tout membre (qonto_transactions,
--   produits_vehicule) et `profiles.active = false` ne coupait rien en base.
-- Principe :
--   - écritures terrain AJOUTÉES pour le salarié, sur SES courses / SA tournée seulement,
--     bornées par des triggers (colonnes terrain + transitions de statut) ;
--   - écritures « bureau » fermées par des policies RESTRICTIVES (président / DG / comptable
--     avec le droit : inchangés) ;
--   - `current_company_id()` = null pour un compte désactivé → toutes les policies qui
--     l'utilisent (66 en prod, écritures surtout) refusent. Les lectures « même société »
--     écrites avec une sous-requête sur `profiles` ne passent PAS par cette fonction : la
--     coupure complète vient du bannissement Auth posé par l'Edge `admin-users`.
--   - FK vers `profiles` : ON DELETE SET NULL (supprimer un compte ne bloque plus, la fiche
--     Équipe et les documents survivent).
-- Additive et réversible (DOWN en bas). Vérifié avant écriture (12/10/2026) : 0 doublon de
--   `team_members.profile_id`, `profiles.active` true pour les 3 comptes.
-- Application MCP : UNE instruction par appel, dans l'ordre (l'outil expire sur les blocs
--   groupés ; corps de fonction entre apostrophes, pas de $$).

-- UP -------------------------------------------------------------------------

-- 1. Compte désactivé = plus de société (écritures refusées partout où la RLS l'utilise).
--    `is not false` : un `active` null (jamais vu) reste actif, comme dans les Edge.
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = public
as 'select company_id from public.profiles where id = auth.uid() and active is not false';

-- 2. Courses : le salarié modifie SES courses (les colonnes sont bornées par le trigger 3).
create policy deliveries_update_salarie on public.deliveries for update to authenticated
  using ((select public.est_salarie()) and company_id = (select public.current_company_id())
         and driver_id = (select public.ma_fiche_equipe()))
  with check ((select public.est_salarie()) and company_id = (select public.current_company_id())
              and driver_id = (select public.ma_fiche_equipe()));

-- 3. Garde des courses : pour un salarié sans le droit `livraisons.livraisons : update`,
--    seules les colonnes terrain bougent (Mes courses : avancerCourse, marquerCharge,
--    ajouterSignature, enregistrerOrdreArretsJour, signalerProbleme ; pod.queries :
--    enregistrerPod) et le statut suit la machine à états terrain
--    (planifiee → en_cours | livree, en_cours → livree). Course facturée / payée / annulée :
--    seul l'ordre des arrêts peut encore bouger.
create or replace function public.deliveries_salarie_garde() returns trigger
language plpgsql set search_path = public
as '
declare
  terrain text[] := array[''statut'', ''delivered_at'', ''charge_le'', ''expediteur_nom'',
    ''lv_signatures'', ''pod_recipient_name'', ''pod_captured_at'', ''probleme_motif'',
    ''probleme_note'', ''probleme_le'', ''stop_order'', ''pickup_order'', ''updated_at''];
  ordre text[] := array[''stop_order'', ''pickup_order'', ''updated_at''];
begin
  if not public.est_salarie() or public.has_permission(''livraisons.livraisons'', ''update'') then
    return new;
  end if;
  if (to_jsonb(old) - terrain) is distinct from (to_jsonb(new) - terrain) then
    raise exception ''Salarié : seules les informations de terrain d''''une course sont modifiables.''
      using errcode = ''42501'';
  end if;
  if old.statut in (''facturee'', ''payee'', ''annulee'')
     and (to_jsonb(old) - ordre) is distinct from (to_jsonb(new) - ordre) then
    raise exception ''Salarié : course close (facturée, payée ou annulée).'' using errcode = ''42501'';
  end if;
  if new.statut is distinct from old.statut and not (
       (old.statut = ''planifiee'' and new.statut in (''en_cours'', ''livree''))
    or (old.statut = ''en_cours'' and new.statut = ''livree'')) then
    raise exception ''Salarié : changement de statut non autorisé.'' using errcode = ''42501'';
  end if;
  return new;
end';

create trigger deliveries_salarie_garde before update on public.deliveries
  for each row execute function public.deliveries_salarie_garde();

-- 4. Photos de course : le salarié indexe un document sur une de SES courses, à son nom.
create policy documents_insert_salarie on public.documents for insert to authenticated
  with check ((select public.est_salarie()) and company_id = (select public.current_company_id())
              and uploaded_by = (select auth.uid()) and entity_type = 'delivery'
              and entity_id in (select d.id from public.deliveries d
                                where d.driver_id = (select public.ma_fiche_equipe())));

-- 5. … et retire SA photo de course dans l'heure (erreur de prise de vue).
create policy documents_delete_salarie on public.documents for delete to authenticated
  using ((select public.est_salarie()) and company_id = (select public.current_company_id())
         and uploaded_by = (select auth.uid()) and entity_type = 'delivery'
         and created_at > now() - interval '1 hour');

-- 6. Fichier correspondant dans le bucket : le sien, déposé il y a moins d'une heure.
create policy documents_storage_delete_salarie on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select public.est_salarie())
         and (storage.foldername(name))[1] = (select public.current_company_id())::text
         and owner = (select auth.uid()) and created_at > now() - interval '1 hour');

-- 7. Dépôt dans le bucket : pour le salarié, seulement `<société>/<fichier>` (photos de
--    course, documents.queries#cheminStockage) ou `<société>/tickets/<fichier>`
--    (receiptsInbox.queries#cheminTicket). Rien d'autre, et compte actif exigé.
create policy documents_storage_insert_salarie on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'documents' or not (select public.est_salarie())
              or ((storage.foldername(name))[1] = (select public.current_company_id())::text
                  and (coalesce(array_length(storage.foldername(name), 1), 0) = 1
                       or (array_length(storage.foldername(name), 1) = 2
                           and (storage.foldername(name))[2] = 'tickets'))));

-- 8. Tournée : le salarié démarre / termine SA tournée (bornée par le trigger 9).
create policy tours_update_salarie on public.tours for update to authenticated
  using ((select public.est_salarie()) and company_id = (select public.current_company_id())
         and driver_id = (select public.ma_fiche_equipe()))
  with check ((select public.est_salarie()) and company_id = (select public.current_company_id())
              and driver_id = (select public.ma_fiche_equipe()));

-- 9. Garde des tournées : sans `planning.tournees : update`, le salarié ne change que
--    `status`, vers en_cours ou terminee, jamais depuis terminee. `started_at` est posé
--    ensuite par le trigger `tours_started_at` (nom après celui-ci : il passe après).
create or replace function public.tours_salarie_garde() returns trigger
language plpgsql set search_path = public
as '
declare
  libres text[] := array[''status'', ''updated_at''];
begin
  if not public.est_salarie() or public.has_permission(''planning.tournees'', ''update'') then
    return new;
  end if;
  if (to_jsonb(old) - libres) is distinct from (to_jsonb(new) - libres) then
    raise exception ''Salarié : seul le statut de la tournée est modifiable.'' using errcode = ''42501'';
  end if;
  if new.status is distinct from old.status
     and not (new.status in (''en_cours'', ''terminee'') and old.status <> ''terminee'') then
    raise exception ''Salarié : changement de statut de tournée non autorisé.'' using errcode = ''42501'';
  end if;
  return new;
end';

create trigger tours_salarie_garde before update on public.tours
  for each row execute function public.tours_salarie_garde();

-- 10. Transactions bancaires : rapprocher / qualifier = droit Trésorerie (Tresorerie.tsx).
--     qonto-sync écrit en service role : non concerné.
create policy qonto_transactions_update_droit on public.qonto_transactions as restrictive for update to authenticated
  using ((select public.is_president()) or (select public.has_permission('finance.tresorerie', 'update')))
  with check ((select public.is_president()) or (select public.has_permission('finance.tresorerie', 'update')));

-- 11-13. Articles véhicule : catalogue réglé dans Paramètres (GestionProduits.tsx), seul écrivain.
create policy produits_vehicule_insert_droit on public.produits_vehicule as restrictive for insert to authenticated
  with check ((select public.is_president()) or (select public.has_permission('systeme.parametres', 'update')));

create policy produits_vehicule_update_droit on public.produits_vehicule as restrictive for update to authenticated
  using ((select public.is_president()) or (select public.has_permission('systeme.parametres', 'update')))
  with check ((select public.is_president()) or (select public.has_permission('systeme.parametres', 'update')));

create policy produits_vehicule_delete_droit on public.produits_vehicule as restrictive for delete to authenticated
  using ((select public.is_president()) or (select public.has_permission('systeme.parametres', 'update')));

-- 14. Un compte = une fiche Équipe au plus (ma_fiche_equipe() lit « la » fiche du compte).
create unique index if not exists team_members_profile_id_uniq on public.team_members (profile_id)
  where profile_id is not null;

-- 15-16. Supprimer un compte ne bloque plus : la fiche et les documents restent, sans auteur.
alter table public.team_members drop constraint team_members_profile_id_fkey,
  add constraint team_members_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null;

alter table public.documents drop constraint documents_uploaded_by_fkey,
  add constraint documents_uploaded_by_fkey foreign key (uploaded_by) references public.profiles(id) on delete set null;

-- DOWN -----------------------------------------------------------------------
-- alter table public.documents drop constraint documents_uploaded_by_fkey,
--   add constraint documents_uploaded_by_fkey foreign key (uploaded_by) references public.profiles(id);
-- alter table public.team_members drop constraint team_members_profile_id_fkey,
--   add constraint team_members_profile_id_fkey foreign key (profile_id) references public.profiles(id);
-- drop index if exists public.team_members_profile_id_uniq;
-- drop policy if exists produits_vehicule_delete_droit on public.produits_vehicule;
-- drop policy if exists produits_vehicule_update_droit on public.produits_vehicule;
-- drop policy if exists produits_vehicule_insert_droit on public.produits_vehicule;
-- drop policy if exists qonto_transactions_update_droit on public.qonto_transactions;
-- drop trigger if exists tours_salarie_garde on public.tours;
-- drop function if exists public.tours_salarie_garde();
-- drop policy if exists tours_update_salarie on public.tours;
-- drop policy if exists documents_storage_insert_salarie on storage.objects;
-- drop policy if exists documents_storage_delete_salarie on storage.objects;
-- drop policy if exists documents_delete_salarie on public.documents;
-- drop policy if exists documents_insert_salarie on public.documents;
-- drop trigger if exists deliveries_salarie_garde on public.deliveries;
-- drop function if exists public.deliveries_salarie_garde();
-- drop policy if exists deliveries_update_salarie on public.deliveries;
-- create or replace function public.current_company_id() returns uuid
--   language sql stable security definer set search_path = public
--   as 'select company_id from public.profiles where id = auth.uid()';
