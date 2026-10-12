-- Migration : cloisonnement du compte salarié (lot S0, plan mca-spec/PLAN-ESPACE-SALARIE.md).
-- Contexte : la plupart des tables sont lisibles par TOUT compte de la société (policies
--   « même société »). Un compte au rôle `chauffeur` (salarié) aurait lu les salaires
--   (`team_members.salary_gross_cts`), les heures de tous, la trésorerie, les charges, les
--   transactions bancaires, les fournisseurs…
-- Principe : on n'élargit rien et on ne touche à aucune policy existante. On AJOUTE des
--   policies RESTRICTIVES de lecture qui ne s'appliquent qu'au salarié (`est_salarie()`) :
--   président, DG, comptable : inchangés.
-- Le salarié garde : ses courses et tournées (policies existantes), les clients DE SES
--   courses (nom, téléphone), sa fiche équipe, ses heures, ses documents (ceux qu'il a
--   déposés + ceux de ses courses), ses tickets, véhicules, société (dépôt).
-- Additive et réversible (DOWN en bas).
-- Application MCP : une instruction par appel (l'outil expire sur les blocs groupés).
-- APPLIQUÉE en prod le 12/10/2026 (vérifié : un compte chauffeur lit 0 charge / 0 fiche ; président inchangé).

-- UP -------------------------------------------------------------------------

create or replace function public.est_salarie() returns boolean
language sql stable security definer set search_path = public
as 'select exists (select 1 from public.profiles where id = auth.uid() and role = ''chauffeur'')';

create or replace function public.ma_fiche_equipe() returns uuid
language sql stable security definer set search_path = public
as 'select id from public.team_members where profile_id = auth.uid() limit 1';

-- Fiche équipe et heures : les siennes seulement.
create policy team_members_salarie_soi on public.team_members as restrictive for select to authenticated
  using (not public.est_salarie() or profile_id = auth.uid());
create policy work_hours_salarie_soi on public.work_hours as restrictive for select to authenticated
  using (not public.est_salarie() or member_id = public.ma_fiche_equipe());

-- Clients : seulement ceux de ses courses (RLS de deliveries appliquée dans la sous-requête).
create policy clients_salarie_ses_courses on public.clients as restrictive for select to authenticated
  using (not public.est_salarie() or id in (select client_id from public.deliveries));

-- Documents : ceux qu'il a déposés, ou rattachés à une de ses courses.
create policy documents_salarie_siens on public.documents as restrictive for select to authenticated
  using (not public.est_salarie() or uploaded_by = auth.uid()
         or (entity_type = 'delivery' and entity_id in (select id from public.deliveries)));

-- Fichiers du bucket `documents` : les siens, ou ceux d'un document qu'il peut lire.
create policy documents_storage_salarie on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'documents' or not public.est_salarie() or owner = auth.uid()
         or exists (select 1 from public.documents d where d.storage_path = objects.name));

-- Finance, flotte, fournisseurs, paramètres de coût : rien pour le salarié.
create policy charges_pas_salarie on public.charges as restrictive for select to authenticated using (not public.est_salarie());
create policy charge_allocations_pas_salarie on public.charge_allocations as restrictive for select to authenticated using (not public.est_salarie());
create policy charge_categories_pas_salarie on public.charge_categories as restrictive for select to authenticated using (not public.est_salarie());
create policy payments_pas_salarie on public.payments as restrictive for select to authenticated using (not public.est_salarie());
create policy qonto_transactions_pas_salarie on public.qonto_transactions as restrictive for select to authenticated using (not public.est_salarie());
create policy treasury_snapshots_pas_salarie on public.treasury_snapshots as restrictive for select to authenticated using (not public.est_salarie());
create policy suppliers_pas_salarie on public.suppliers as restrictive for select to authenticated using (not public.est_salarie());
create policy cost_profiles_pas_salarie on public.cost_profiles as restrictive for select to authenticated using (not public.est_salarie());
create policy fuel_logs_pas_salarie on public.fuel_logs as restrictive for select to authenticated using (not public.est_salarie());
create policy incidents_pas_salarie on public.incidents as restrictive for select to authenticated using (not public.est_salarie());
create policy vehicle_inspections_pas_salarie on public.vehicle_inspections as restrictive for select to authenticated using (not public.est_salarie());
create policy vehicle_maintenances_pas_salarie on public.vehicle_maintenances as restrictive for select to authenticated using (not public.est_salarie());
create policy produits_vehicule_pas_salarie on public.produits_vehicule as restrictive for select to authenticated using (not public.est_salarie());
create policy integration_sync_state_pas_salarie on public.integration_sync_state as restrictive for select to authenticated using (not public.est_salarie());

-- DOWN -----------------------------------------------------------------------
-- drop policy if exists team_members_salarie_soi on public.team_members;
-- drop policy if exists work_hours_salarie_soi on public.work_hours;
-- drop policy if exists clients_salarie_ses_courses on public.clients;
-- drop policy if exists documents_salarie_siens on public.documents;
-- drop policy if exists documents_storage_salarie on storage.objects;
-- drop policy if exists charges_pas_salarie on public.charges;
-- drop policy if exists charge_allocations_pas_salarie on public.charge_allocations;
-- drop policy if exists charge_categories_pas_salarie on public.charge_categories;
-- drop policy if exists payments_pas_salarie on public.payments;
-- drop policy if exists qonto_transactions_pas_salarie on public.qonto_transactions;
-- drop policy if exists treasury_snapshots_pas_salarie on public.treasury_snapshots;
-- drop policy if exists suppliers_pas_salarie on public.suppliers;
-- drop policy if exists cost_profiles_pas_salarie on public.cost_profiles;
-- drop policy if exists fuel_logs_pas_salarie on public.fuel_logs;
-- drop policy if exists incidents_pas_salarie on public.incidents;
-- drop policy if exists vehicle_inspections_pas_salarie on public.vehicle_inspections;
-- drop policy if exists vehicle_maintenances_pas_salarie on public.vehicle_maintenances;
-- drop policy if exists produits_vehicule_pas_salarie on public.produits_vehicule;
-- drop policy if exists integration_sync_state_pas_salarie on public.integration_sync_state;
-- drop function if exists public.ma_fiche_equipe();
-- drop function if exists public.est_salarie();
