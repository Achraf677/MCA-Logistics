-- Remplace les index partiels (incompatibles ON CONFLICT PostgREST) par des index
-- réguliers. PostgreSQL traite NULL != NULL dans les index UNIQUE : plusieurs lignes
-- avec pennylane_id IS NULL sur le même company_id restent autorisées.

-- UP
drop index if exists public.charges_company_pennylane_uniq;
drop index if exists public.suppliers_company_pennylane_uniq;

create unique index if not exists charges_company_pennylane_uniq
  on public.charges (company_id, pennylane_id);

create unique index if not exists suppliers_company_pennylane_uniq
  on public.suppliers (company_id, pennylane_id);

-- DOWN
-- drop index if exists public.charges_company_pennylane_uniq;
-- drop index if exists public.suppliers_company_pennylane_uniq;
