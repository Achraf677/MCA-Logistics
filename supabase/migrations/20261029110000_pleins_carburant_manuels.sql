-- Pleins carburant saisis à la main par le bureau (sans justificatif). Additive. RLS = même droit que les justificatifs (finance.charges).
create table if not exists public.pleins_carburant (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date_plein date not null,
  montant_ttc_cts integer not null check (montant_ttc_cts >= 0),
  carte text check (carte is null or carte in ('edenred_9156')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pleins_carburant_mois_idx on public.pleins_carburant (company_id, date_plein);
alter table public.pleins_carburant enable row level security;
create policy pleins_carburant_select on public.pleins_carburant for select to authenticated
  using (company_id = current_company_id() and (is_president() or has_permission('finance.charges', 'view')));
create policy pleins_carburant_insert on public.pleins_carburant for insert to authenticated
  with check (company_id = current_company_id() and (is_president() or has_permission('finance.charges', 'update')));
create policy pleins_carburant_update on public.pleins_carburant for update to authenticated
  using (company_id = current_company_id() and (is_president() or has_permission('finance.charges', 'update')));
create policy pleins_carburant_delete on public.pleins_carburant for delete to authenticated
  using (company_id = current_company_id() and (is_president() or has_permission('finance.charges', 'delete')));

-- DOWN (en commentaire)
-- drop table if exists public.pleins_carburant;
