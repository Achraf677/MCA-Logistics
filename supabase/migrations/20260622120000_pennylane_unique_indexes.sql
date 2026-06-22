-- Index unique partiel sur charges (company_id, pennylane_id).
-- Partiel = laisse coexister les lignes manuelles (pennylane_id IS NULL).
-- UP
create unique index if not exists charges_company_pennylane_uniq
  on public.charges (company_id, pennylane_id)
  where pennylane_id is not null;

create unique index if not exists suppliers_company_pennylane_uniq
  on public.suppliers (company_id, pennylane_id)
  where pennylane_id is not null;

-- DOWN
-- drop index if exists public.charges_company_pennylane_uniq;
-- drop index if exists public.suppliers_company_pennylane_uniq;
