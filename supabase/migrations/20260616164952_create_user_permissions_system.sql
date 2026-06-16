-- ============================================================
-- SOCLE DU SYSTÈME DE PERMISSIONS (RBAC à grain fin)
-- Permissions CRUD par module, pilotées par le président.
-- Le président n'a JAMAIS de ligne ici : il bypasse tout (toujours autorisé).
-- Un compte sans ligne = aucun accès (moindre privilège).
-- ============================================================

create table public.user_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  resource_key text not null,          -- ex 'finance.tresorerie' (catalogue défini côté front = la nav réelle)
  can_view    boolean not null default false,
  can_create  boolean not null default false,
  can_update  boolean not null default false,
  can_delete  boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, resource_key)
);

comment on table public.user_permissions is
  'Permissions CRUD par compte et par module du site. Écrites uniquement par le président via Edge admin-permissions (service role). Le président bypasse (aucune ligne).';

create index user_permissions_user_idx    on public.user_permissions (user_id);
create index user_permissions_company_idx on public.user_permissions (company_id);

-- RLS : chaque compte peut LIRE ses propres permissions (pour que le front masque l'UI).
-- L'écriture passe exclusivement par l'Edge (service role, gated président) → aucune policy d'écriture côté client.
alter table public.user_permissions enable row level security;

create policy "compte lit ses propres permissions"
  on public.user_permissions
  for select
  using (user_id = auth.uid());
