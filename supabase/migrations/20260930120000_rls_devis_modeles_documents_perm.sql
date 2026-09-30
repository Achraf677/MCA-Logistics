-- UP
-- Lot 2 sécurité (Devis / Modèles / Documents) : aligner la RLS sur les droits.
--
-- 1) quotes / delivery_templates — LECTURE
--    Avant : réservée aux rôles president/dg/comptable (policies *_select_own,
--    rôle `public`), alors que l'onglet s'affiche selon le droit
--    livraisons.devis / livraisons.modeles → un compte à qui l'on donne le droit
--    voyait un onglet vide.
--    Après : même société ET (président OU rôle dg/comptable — accès actuel
--    conservé — OU droit « voir » sur la ressource).
--
-- 2) Storage, bucket `documents` — SUPPRESSION et MODIFICATION
--    Avant : tout membre de la société pouvait effacer / écraser n'importe quel
--    fichier (seul le 1er dossier = company_id était contrôlé).
--    Après : même contrôle de dossier ET (président OU droit systeme.documents
--    delete / update), comme la table public.documents.
--    Lecture et dépôt (select / insert) inchangés : nécessaires au chauffeur
--    (photos de preuve, tickets).

-- ── quotes ──────────────────────────────────────────────────────────────────
drop policy if exists quotes_select_own  on public.quotes;
drop policy if exists quotes_select_perm on public.quotes;
create policy quotes_select_perm on public.quotes
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_president()
      or (select p.role from public.profiles p where p.id = auth.uid()) in ('dg', 'comptable')
      or public.has_permission('livraisons.devis', 'view')
    )
  );

-- ── delivery_templates ──────────────────────────────────────────────────────
drop policy if exists delivery_templates_select_own  on public.delivery_templates;
drop policy if exists delivery_templates_select_perm on public.delivery_templates;
create policy delivery_templates_select_perm on public.delivery_templates
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_president()
      or (select p.role from public.profiles p where p.id = auth.uid()) in ('dg', 'comptable')
      or public.has_permission('livraisons.modeles', 'view')
    )
  );

-- ── storage.objects, bucket `documents` ─────────────────────────────────────
drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (public.is_president() or public.has_permission('systeme.documents', 'delete'))
  );

drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (public.is_president() or public.has_permission('systeme.documents', 'update'))
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and (public.is_president() or public.has_permission('systeme.documents', 'update'))
  );

-- DOWN (remet exactement les policies relevées en prod le 30/09/2026)
-- drop policy if exists quotes_select_perm on public.quotes;
-- create policy quotes_select_own on public.quotes
--   for select to public
--   using (
--     company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
--     and (select profiles.role from public.profiles where profiles.id = auth.uid())
--         = any (array['president'::text, 'dg'::text, 'comptable'::text])
--   );
--
-- drop policy if exists delivery_templates_select_perm on public.delivery_templates;
-- create policy delivery_templates_select_own on public.delivery_templates
--   for select to public
--   using (
--     company_id = (select profiles.company_id from public.profiles where profiles.id = auth.uid())
--     and (select profiles.role from public.profiles where profiles.id = auth.uid())
--         = any (array['president'::text, 'dg'::text, 'comptable'::text])
--   );
--
-- drop policy if exists documents_storage_delete on storage.objects;
-- create policy documents_storage_delete on storage.objects
--   for delete to authenticated
--   using (
--     bucket_id = 'documents'
--     and (storage.foldername(name))[1] = (select profiles.company_id::text from public.profiles where profiles.id = auth.uid())
--   );
--
-- drop policy if exists documents_storage_update on storage.objects;
-- create policy documents_storage_update on storage.objects
--   for update to authenticated
--   using (
--     bucket_id = 'documents'
--     and (storage.foldername(name))[1] = (select profiles.company_id::text from public.profiles where profiles.id = auth.uid())
--   );
