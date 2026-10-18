-- Migration : point de départ des tournées de colis (centre de tri La Poste), réglé une fois
-- dans Paramètres › Société. Lu par l'Edge `optimiser-tournee-colis` (départ par défaut, avant
-- l'adresse du remettant lue sur la feuille et le dépôt). Additive, nullable.

-- UP -------------------------------------------------------------------------

alter table public.companies
  add column if not exists depart_colis_adresse text,
  add column if not exists depart_colis_lat double precision,
  add column if not exists depart_colis_lng double precision;

-- DOWN -----------------------------------------------------------------------
-- alter table public.companies drop column if exists depart_colis_lng,
--   drop column if exists depart_colis_lat, drop column if exists depart_colis_adresse;
