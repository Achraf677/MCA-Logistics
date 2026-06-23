-- Migration : lie chaque débit Qonto à une charge (rapprochement bancaire).
-- Calque de fuel_logs.charge_id : 1 transaction ↔ 1 charge max.

-- ── UP ────────────────────────────────────────────────────────────────────────

alter table public.qonto_transactions
  add column if not exists charge_id uuid references public.charges(id) on delete set null;

-- Index unique partiel : une charge ne peut être liée qu'à une seule transaction.
create unique index if not exists qonto_transactions_charge_id_uidx
  on public.qonto_transactions(charge_id)
  where charge_id is not null;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- drop index if exists public.qonto_transactions_charge_id_uidx;
-- alter table public.qonto_transactions drop column if exists charge_id;
