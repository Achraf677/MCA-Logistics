-- UP : verrouiller l'écriture de profiles côté client (anti-escalade company_id/role)
revoke insert, update on table public.profiles from anon, authenticated;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
-- profiles_select_own conservée : chacun lit son propre profil (login OK).
-- Les profils sont créés/attribués uniquement par l'admin (service_role), jamais auto-déclarés.

-- DOWN (commenté)
-- grant insert, update on table public.profiles to authenticated;
-- create policy profiles_insert_own on public.profiles for insert to public with check (id = auth.uid());
-- create policy profiles_update_own on public.profiles for update to public using (id = auth.uid());
