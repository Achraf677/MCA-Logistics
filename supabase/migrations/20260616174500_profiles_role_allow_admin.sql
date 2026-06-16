-- Autorise le rôle 'admin' (comptes à permissions personnalisées) en plus des rôles existants.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['president'::text, 'dg'::text, 'chauffeur'::text, 'comptable'::text, 'admin'::text]));
