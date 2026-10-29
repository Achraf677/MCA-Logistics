-- Transactions bancaires : on garde la table qonto_transactions et on ajoute la banque d'origine.
-- Les lignes existantes restent 'qonto'. Les opérations du compte Swan (via Pennylane) sont 'swan',
-- avec qonto_id préfixé 'swan:' pour rester unique.
-- UP
alter table public.qonto_transactions
  add column if not exists source text not null default 'qonto';
alter table public.qonto_transactions
  add constraint qonto_transactions_source_check check (source in ('qonto', 'swan'));
create index if not exists idx_qonto_transactions_source_settled
  on public.qonto_transactions (source, settled_at desc);
-- DOWN
-- drop index if exists public.idx_qonto_transactions_source_settled;
-- alter table public.qonto_transactions drop constraint if exists qonto_transactions_source_check;
-- alter table public.qonto_transactions drop column if exists source;
