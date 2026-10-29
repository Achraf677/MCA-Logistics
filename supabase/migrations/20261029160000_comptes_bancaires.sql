-- Comptes bancaires de la société (Système › Cartes bancaires) : plusieurs comptes, RIB en PDF (bucket `documents`, dossier `<company>/ribs/`).
-- Additive : `companies.iban / bic` restent en base (plus écrits ; repris ici dans « Compte principal »).
-- Lecture / écriture : président ou droit Système › Paramètres (un compte salarié ne lit rien).
create table if not exists public.comptes_bancaires (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  libelle text not null,
  banque text,
  iban text,
  bic text,
  rib_path text,
  rib_nom text,
  created_at timestamptz not null default now()
);
alter table public.comptes_bancaires enable row level security;
create policy comptes_bancaires_select on public.comptes_bancaires for select to authenticated
  using (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'view')));
create policy comptes_bancaires_insert on public.comptes_bancaires for insert to authenticated
  with check (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));
create policy comptes_bancaires_update on public.comptes_bancaires for update to authenticated
  using (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));
create policy comptes_bancaires_delete on public.comptes_bancaires for delete to authenticated
  using (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));

insert into public.comptes_bancaires (company_id, libelle, iban, bic)
select id, 'Compte principal', iban, bic from public.companies
where (iban is not null or bic is not null)
  and not exists (select 1 from public.comptes_bancaires b where b.company_id = companies.id);

-- DOWN (en commentaire)
-- drop table if exists public.comptes_bancaires;
