-- UP
alter table public.deliveries
  add column if not exists pennylane_invoice_number text;

-- DOWN
-- alter table public.deliveries drop column if exists pennylane_invoice_number;
