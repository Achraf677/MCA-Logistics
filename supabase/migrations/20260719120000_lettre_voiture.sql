-- Migration : Lettre de voiture nationale numérique
-- Objectif   : rendre chaque livraison "control-proof" (DREAL/gendarmerie) en
--              collectant sur la livraison toutes les mentions obligatoires
--              (décret 99-752 / art. L132-9 Code de commerce).
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive, tous les nouveaux champs NULLABLE (aucune donnée à remplir en
-- rétrospectif). Rétrocompat totale — la colonne legacy `lettre_voiture_url`
-- reste en place pour ne pas casser l'existant ; la génération v2 écrit dans
-- la nouvelle colonne `lv_pdf_url`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) deliveries : mentions obligatoires + numéro + signatures + PDF
alter table public.deliveries
  add column if not exists expediteur_nom     text,
  add column if not exists expediteur_siren   text,
  add column if not exists destinataire_nom   text,
  add column if not exists marchandise_desc   text,
  add column if not exists nb_colis           integer,
  add column if not exists poids_kg_reel      numeric(10,2),
  add column if not exists lv_numero          text,
  add column if not exists lv_signatures      jsonb not null default '{}'::jsonb,
  add column if not exists lv_pdf_url         text;

comment on column public.deliveries.expediteur_nom is
  'Mention obligatoire LV : nom (ou raison sociale) de l''expéditeur.';
comment on column public.deliveries.expediteur_siren is
  'Mention obligatoire LV : SIREN de l''expéditeur (utile aux contrôles DREAL).';
comment on column public.deliveries.destinataire_nom is
  'Mention obligatoire LV : nom du destinataire final (personne physique/morale).';
comment on column public.deliveries.marchandise_desc is
  'Mention obligatoire LV : dénomination courante et nature de la marchandise.';
comment on column public.deliveries.nb_colis is
  'Mention obligatoire LV : nombre de colis / unités remis au transporteur.';
comment on column public.deliveries.poids_kg_reel is
  'Mention obligatoire LV : poids réel remis (kg). Distinct de deliveries.weight_kg
   utilisé comme nb palettes pour le calcul tarifaire.';
comment on column public.deliveries.lv_numero is
  'Numérotation applicative de la lettre de voiture : format « LV-AAAA-N »
   (séquentiel par année). Attribué à la 1ʳᵉ génération PDF.';
comment on column public.deliveries.lv_signatures is
  'JSONB { expediteur?: {png, ts, geo?}, transporteur?: {…}, destinataire?: {…} }
   collecté au chargement / à la livraison. Les timestamps servent de preuve
   forte (prise en charge / remise).';
comment on column public.deliveries.lv_pdf_url is
  'URL du PDF LV archivé sur Drive (nouvelle génération). La colonne legacy
   lettre_voiture_url est conservée pour rétrocompat mais n''est plus écrite.';

-- Index sur le numéro LV pour lookups rapides (unicité applicative,
-- pas contraint côté DB : on tolère les regénérations manuelles).
create index if not exists idx_deliveries_lv_numero
  on public.deliveries(lv_numero)
  where lv_numero is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) companies : licence de transport (DREAL) — obligatoire sur la LV
alter table public.companies
  add column if not exists licence_transport text;

comment on column public.companies.licence_transport is
  'Numéro de licence de transport (DREAL). Mention obligatoire sur la lettre
   de voiture. Distinct de transport_license_expiry (date d''expiration).';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   alter table public.companies drop column if exists licence_transport;
--   drop index if exists public.idx_deliveries_lv_numero;
--   alter table public.deliveries
--     drop column if exists lv_pdf_url,
--     drop column if exists lv_signatures,
--     drop column if exists lv_numero,
--     drop column if exists poids_kg_reel,
--     drop column if exists nb_colis,
--     drop column if exists marchandise_desc,
--     drop column if exists destinataire_nom,
--     drop column if exists expediteur_siren,
--     drop column if exists expediteur_nom;
--
-- Perte : signatures collectées + numéros LV attribués + URL PDF.
-- Les PDFs archivés sur Drive restent accessibles (pas concernés par le drop).
