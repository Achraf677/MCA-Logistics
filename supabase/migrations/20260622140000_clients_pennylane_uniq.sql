-- Index unique régulier (non-partiel) sur clients(company_id, pennylane_id).
-- PostgreSQL : NULL != NULL dans les UNIQUE INDEX → plusieurs clients manuels
-- sans pennylane_id sur le même company_id restent autorisés.
-- Régulier (pas partiel) → ON CONFLICT (company_id, pennylane_id) PostgREST OK.

-- UP
create unique index if not exists clients_company_pennylane_uniq
  on public.clients (company_id, pennylane_id);

-- DOWN
-- drop index if exists public.clients_company_pennylane_uniq;
