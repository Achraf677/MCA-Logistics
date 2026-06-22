-- Catégories de charges en table (dynamiques, versionables, verrouillage système).
-- UP

-- ── 1. Table ──────────────────────────────────────────────────────────────────
create table if not exists public.charge_categories (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  name        text        not null,
  slug        text        not null,
  type        text        null,        -- routage rapprochement ('carburant', 'entretien', ...)
  is_system   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, slug)
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
alter table public.charge_categories enable row level security;

-- SELECT : tout membre de la société
create policy "charge_categories_select"
  on public.charge_categories for select to authenticated
  using (company_id = public.current_company_id());

-- INSERT : avec permission finance.charges.create (ou président)
create policy "charge_categories_insert"
  on public.charge_categories for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and (public.is_president() or public.has_permission('finance.charges', 'create'))
  );

-- UPDATE : non-système uniquement
create policy "charge_categories_update"
  on public.charge_categories for update to authenticated
  using (
    company_id = public.current_company_id()
    and is_system = false
    and (public.is_president() or public.has_permission('finance.charges', 'update'))
  )
  with check (
    company_id = public.current_company_id()
    and is_system = false
  );

-- DELETE : non-système uniquement (FK RESTRICT + trigger font le reste)
create policy "charge_categories_delete"
  on public.charge_categories for delete to authenticated
  using (
    company_id = public.current_company_id()
    and is_system = false
    and (public.is_president() or public.has_permission('finance.charges', 'delete'))
  );

-- ── 3. Garde-fou trigger : interdit la suppression des catégories système ─────
-- (double protection avec la policy RLS ci-dessus)
create or replace function public.prevent_system_category_delete()
returns trigger language plpgsql security definer as $$
begin
  if old.is_system then
    raise exception 'Les catégories système ne peuvent pas être supprimées.';
  end if;
  return old;
end;
$$;

create trigger trg_prevent_system_category_delete
  before delete on public.charge_categories
  for each row execute function public.prevent_system_category_delete();

-- ── 4. Seed catégories système pour chaque société existante ──────────────────
insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Carburant', 'carburant', 'carburant', true from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Entretien', 'entretien', 'entretien', true from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Assurance', 'assurance', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Salaires', 'salaire', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Logiciels', 'logiciel', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Télécom', 'telecom', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Loyer', 'loyer', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Frais bancaires', 'frais_bancaires', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Comptabilité', 'comptabilite', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Publicité', 'publicite', null, false from public.companies
on conflict (company_id, slug) do nothing;

insert into public.charge_categories (company_id, name, slug, type, is_system)
select id, 'Autres', 'autre', null, false from public.companies
on conflict (company_id, slug) do nothing;

-- ── 5. Backfill catégories perso depuis les slugs distincts en base ───────────
-- (charges qui auraient un slug hors de la liste canonique ci-dessus)
insert into public.charge_categories (company_id, name, slug, type, is_system)
select distinct
  ch.company_id,
  initcap(replace(ch.category, '_', ' ')),
  ch.category,
  null,
  false
from public.charges ch
where ch.category is not null
on conflict (company_id, slug) do nothing;

-- ── 6. Ajoute category_id sur charges ─────────────────────────────────────────
alter table public.charges
  add column if not exists category_id uuid
    references public.charge_categories(id) on delete restrict;

-- ── 7. Backfill category_id depuis company_id + slug ──────────────────────────
update public.charges ch
set category_id = cc.id
from public.charge_categories cc
where cc.company_id = ch.company_id
  and cc.slug       = ch.category
  and ch.category   is not null;

-- ── 8. Supprime l'ancienne colonne texte ──────────────────────────────────────
alter table public.charges drop column if exists category;

-- DOWN (commenté — à décommenter manuellement si rollback nécessaire)
-- alter table public.charges add column if not exists category text;
-- update public.charges ch set category = cc.slug
--   from public.charge_categories cc where cc.id = ch.category_id;
-- alter table public.charges drop column if exists category_id;
-- drop trigger if exists trg_prevent_system_category_delete on public.charge_categories;
-- drop function if exists public.prevent_system_category_delete();
-- drop table if exists public.charge_categories;
