-- ════════════════════════════════════════════════════════════════
-- FONDATION : 3 fonctions helper qui branchent la RLS sur les permissions
-- ════════════════════════════════════════════════════════════════

-- Société du compte courant
create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Le compte courant est-il président ? (bypass total)
create or replace function public.is_president()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'president'
  );
$$;

-- Le compte courant a-t-il la permission demandée sur une ressource ?
create or replace function public.has_permission(p_resource text, p_action text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_permissions up
    where up.user_id = auth.uid()
      and up.resource_key = p_resource
      and case p_action
        when 'view'   then up.can_view
        when 'create' then up.can_create
        when 'update' then up.can_update
        when 'delete' then up.can_delete
        else false
      end
  );
$$;

revoke all on function public.current_company_id()              from public;
revoke all on function public.is_president()                    from public;
revoke all on function public.has_permission(text, text)        from public;
grant execute on function public.current_company_id()           to authenticated;
grant execute on function public.is_president()                 to authenticated;
grant execute on function public.has_permission(text, text)     to authenticated;

-- ════════════════════════════════════════════════════════════════
-- CLIENTS : on remplace les règles "par rôle" par des règles "par permission"
-- (le SELECT reste large au niveau société — lecture intra-entreprise)
-- ════════════════════════════════════════════════════════════════

drop policy if exists clients_insert_dg_president on public.clients;
drop policy if exists clients_update_dg_president on public.clients;
drop policy if exists clients_delete_president    on public.clients;

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and (public.is_president() or public.has_permission('tiers.clients', 'create'))
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_president() or public.has_permission('tiers.clients', 'update'))
  )
  with check (
    company_id = public.current_company_id()
    and (public.is_president() or public.has_permission('tiers.clients', 'update'))
  );

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_president() or public.has_permission('tiers.clients', 'delete'))
  );
