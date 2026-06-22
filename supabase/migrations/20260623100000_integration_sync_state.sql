-- Migration : table integration_sync_state
-- Stocke l'horodatage du dernier run réussi de chaque intégration.
-- Écriture UNIQUEMENT via les Edge Functions (service_role, bypasse la RLS).
-- Lecture autorisée aux membres de la company (anon key, RLS SELECT).

-- ── UP ────────────────────────────────────────────────────────────────────────

create table if not exists public.integration_sync_state (
  company_id    uuid    not null references public.companies(id) on delete cascade,
  integration   text    not null,   -- 'pennylane_charges' | 'pennylane_clients'
  last_run_at   timestamptz not null default now(),
  primary key (company_id, integration)
);

alter table public.integration_sync_state enable row level security;

-- Membres de la company : lecture seule (pas d'INSERT/UPDATE depuis le client).
create policy "members can select own integration_sync_state"
  on public.integration_sync_state
  for select
  using (company_id = public.current_company_id());

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- drop table if exists public.integration_sync_state;
