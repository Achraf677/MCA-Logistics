-- UP
alter table public.quotes
  add column if not exists pennylane_quote_number text;

-- DOWN
-- alter table public.quotes drop column if exists pennylane_quote_number;
