-- Branche TOUTES les tables métier sur le système de permissions.
-- Règle uniforme (écritures) : appartenance société + (président OU permission cochée).
-- Le SELECT reste large au niveau société (lecture intra-entreprise) : on ne le touche pas
-- pour éviter de casser les listes déroulantes inter-modules.
do $do$
declare
  r record;
  p record;
begin
  for r in
    select * from (values
      ('suppliers',            'tiers.fournisseurs'),
      ('deliveries',           'livraisons.livraisons'),
      ('delivery_templates',   'livraisons.modeles'),
      ('quotes',               'livraisons.devis'),
      ('charges',              'finance.charges'),
      ('payments',             'finance.encaissement'),
      ('fuel_logs',            'flotte.carburant'),
      ('vehicles',             'flotte.vehicules'),
      ('vehicle_maintenances', 'flotte.entretiens'),
      ('vehicle_inspections',  'flotte.inspections'),
      ('tours',                'planning.tournees'),
      ('team_members',         'equipe.membres'),
      ('work_hours',           'equipe.heures'),
      ('incidents',            'flotte.incidents'),
      ('documents',            'systeme.documents'),
      ('cost_profiles',        'pilotage.rentabilite')
    ) as t(tbl, res)
  loop
    -- Supprime toutes les anciennes règles d'écriture (insert/update/delete)
    for p in
      select polname from pg_policy
      where polrelid = ('public.' || r.tbl)::regclass and polcmd in ('a','w','d')
    loop
      execute format('drop policy if exists %I on public.%I', p.polname, r.tbl);
    end loop;

    -- INSERT
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L)))',
      r.tbl || '_insert_perm', r.tbl, r.res, 'create');

    -- UPDATE
    execute format(
      'create policy %I on public.%I for update to authenticated using (company_id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L))) with check (company_id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L)))',
      r.tbl || '_update_perm', r.tbl, r.res, 'update', r.res, 'update');

    -- DELETE
    execute format(
      'create policy %I on public.%I for delete to authenticated using (company_id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L)))',
      r.tbl || '_delete_perm', r.tbl, r.res, 'delete');
  end loop;

  -- companies : UPDATE uniquement (jamais d'insert/delete de société via l'app)
  execute 'drop policy if exists companies_update_president on public.companies';
  execute 'drop policy if exists companies_update_perm on public.companies';
  execute format(
    'create policy companies_update_perm on public.companies for update to authenticated using (id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L))) with check (id = public.current_company_id() and (public.is_president() or public.has_permission(%L, %L)))',
    'systeme.parametres','update','systeme.parametres','update');
end
$do$;
