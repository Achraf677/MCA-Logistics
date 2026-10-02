-- UP
-- Revue 05, lots D1 + D2 — le devis devient une fiche de prix : prestation,
-- quantité × prix unitaire (colis, km, palette ou forfait), suppléments,
-- référence client, autoliquidation, date d'acceptation.
-- Colonnes additives (nullables, ou défaut neutre) : les devis existants restent
-- lisibles (montant global, 1 × HT).
alter table public.quotes
  add column if not exists prestation text
    check (prestation in ('express', 'messagerie', 'dediee', 'mise_a_dispo', 'forfait')),
  -- Unité de la ligne principale (figée depuis le tarif du client à la création).
  add column if not exists unite text
    check (unite in ('colis', 'km', 'palette', 'forfait')),
  add column if not exists quantite numeric(12, 2)
    check (quantite is null or quantite > 0),
  add column if not exists prix_unitaire_cts integer
    check (prix_unitaire_cts is null or prix_unitaire_cts >= 0),
  -- Suppléments : même forme que deliveries.extra_lines
  -- [{ label, quantity, amount_ht_cts, tva_rate }].
  add column if not exists extra_lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(extra_lines) = 'array'),
  add column if not exists reference_client text,
  add column if not exists autoliquidation boolean not null default false,
  add column if not exists accepte_le timestamptz;

comment on column public.quotes.unite is 'Unité de la ligne principale : colis, km, palette ou forfait.';
comment on column public.quotes.quantite is 'Quantité de la ligne principale (colis par mois en messagerie).';
comment on column public.quotes.prix_unitaire_cts is 'Prix HT unitaire de la ligne principale (centimes).';
comment on column public.quotes.extra_lines is 'Suppléments [{label, quantity, amount_ht_cts, tva_rate}] ; amount_ht_cts du devis = principal + suppléments.';
comment on column public.quotes.accepte_le is 'Date à laquelle le devis a été marqué accepté.';

-- DOWN
-- alter table public.quotes
--   drop column if exists accepte_le, drop column if exists autoliquidation,
--   drop column if exists reference_client, drop column if exists extra_lines,
--   drop column if exists prix_unitaire_cts, drop column if exists quantite,
--   drop column if exists unite, drop column if exists prestation;
