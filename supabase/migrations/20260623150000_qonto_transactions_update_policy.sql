-- Migration : policy UPDATE sur qonto_transactions pour le rapprochement côté front.
-- La table est écrite par l'Edge (service_role) mais le rapprochement charge↔débit
-- est fait par le client authentifié → il faut une policy UPDATE explicite.
-- Même helper current_company_id() que toutes les policies récentes du projet.

create policy "qonto_transactions_update_company"
  on public.qonto_transactions
  for update
  to authenticated
  using  (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- drop policy if exists "qonto_transactions_update_company" on public.qonto_transactions;
