-- ── CLIENTS : tarif (source du montant auto des livraisons) ──────────────────
alter table public.clients
  add column if not exists tariff_mode text not null default 'manuel',
  add column if not exists tariff_rate_cts bigint;

-- borne les valeurs autorisées (droppable au down)
alter table public.clients
  drop constraint if exists clients_tariff_mode_chk;
alter table public.clients
  add constraint clients_tariff_mode_chk
  check (tariff_mode in ('forfait','km','palette','manuel'));

-- ── VEHICLES : échéances réglementaires ──────────────────────────────────────
alter table public.vehicles
  add column if not exists ct_expiry date,
  add column if not exists insurance_expiry date,
  add column if not exists next_revision_date date;

-- ── TEAM_MEMBERS : validités chauffeur ───────────────────────────────────────
alter table public.team_members
  add column if not exists licence_b_expiry date,
  add column if not exists medical_visit_expiry date;

-- ── DELIVERIES : montants + jalons facturation/paiement ──────────────────────
alter table public.deliveries
  add column if not exists amount_ht_cts bigint,
  add column if not exists tva_cts bigint,
  add column if not exists amount_ttc_cts bigint,
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz;
