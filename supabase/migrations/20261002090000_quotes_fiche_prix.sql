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
  add column if not exists accepte_le timestamptz,
  -- Mêmes champs que la fiche livraison (mêmes noms), repris tels quels à la
  -- création de la course : contacts des arrêts, marchandise, trajet.
  add column if not exists expediteur_nom text,
  add column if not exists expediteur_tel text,
  add column if not exists destinataire_nom text,
  add column if not exists destinataire_tel text,
  add column if not exists marchandise_desc text,
  add column if not exists nb_colis integer check (nb_colis is null or nb_colis >= 0),
  add column if not exists poids_kg numeric(10, 2) check (poids_kg is null or poids_kg >= 0),
  add column if not exists volume_m3 numeric(10, 2) check (volume_m3 is null or volume_m3 >= 0),
  add column if not exists km numeric(10, 1) check (km is null or km >= 0);

comment on column public.quotes.unite is 'Unité de la ligne principale : colis, km, palette ou forfait.';
comment on column public.quotes.quantite is 'Quantité de la ligne principale (colis par mois en messagerie).';
comment on column public.quotes.prix_unitaire_cts is 'Prix HT unitaire de la ligne principale (centimes).';
comment on column public.quotes.extra_lines is 'Suppléments [{label, quantity, amount_ht_cts, tva_rate}] ; amount_ht_cts du devis = principal + suppléments.';
comment on column public.quotes.accepte_le is 'Date à laquelle le devis a été marqué accepté.';

-- DOWN
-- alter table public.quotes
--   drop column if exists km, drop column if exists volume_m3, drop column if exists poids_kg,
--   drop column if exists nb_colis, drop column if exists marchandise_desc,
--   drop column if exists destinataire_tel, drop column if exists destinataire_nom,
--   drop column if exists expediteur_tel, drop column if exists expediteur_nom,
--   drop column if exists accepte_le, drop column if exists autoliquidation,
--   drop column if exists reference_client, drop column if exists extra_lines,
--   drop column if exists prix_unitaire_cts, drop column if exists quantite,
--   drop column if exists unite, drop column if exists prestation;
