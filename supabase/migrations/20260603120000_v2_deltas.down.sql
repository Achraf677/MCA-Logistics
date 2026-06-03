alter table public.deliveries
  drop column if exists amount_ht_cts,
  drop column if exists tva_cts,
  drop column if exists amount_ttc_cts,
  drop column if exists invoiced_at,
  drop column if exists paid_at;

alter table public.team_members
  drop column if exists licence_b_expiry,
  drop column if exists medical_visit_expiry;

alter table public.vehicles
  drop column if exists ct_expiry,
  drop column if exists insurance_expiry,
  drop column if exists next_revision_date;

alter table public.clients
  drop constraint if exists clients_tariff_mode_chk,
  drop column if exists tariff_mode,
  drop column if exists tariff_rate_cts;
