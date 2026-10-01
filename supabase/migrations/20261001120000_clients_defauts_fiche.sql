-- UP
-- Revue 03b, lot B — la fiche client porte les DÉFAUTS de ses courses : une
-- donnée saisie une fois ici n'est plus redemandée à chaque livraison.
-- Colonnes additives (nullables, ou défaut neutre).
alter table public.clients
  -- Pays de facturation (ISO 3166 alpha-2) : adresse Pennylane + autoliquidation.
  add column if not exists pays text not null default 'FR'
    check (pays ~ '^[A-Z]{2}$'),
  -- Point de retrait habituel (pré-remplit le bloc Retrait d'une nouvelle course).
  add column if not exists retrait_adresse text,
  add column if not exists retrait_contact text,
  add column if not exists retrait_tel text,
  -- Exécution habituelle.
  add column if not exists chauffeur_habituel_id uuid references public.team_members(id) on delete set null,
  add column if not exists vehicule_habituel_id uuid references public.vehicles(id) on delete set null,
  add column if not exists prestation_defaut text
    check (prestation_defaut in ('express', 'messagerie', 'dediee', 'mise_a_dispo', 'forfait')),
  -- Le client exige sa référence (ODT, n° de commande) sur la facture.
  add column if not exists reference_obligatoire boolean not null default false,
  -- Catalogue de suppléments du client : [{ "label": text, "prix_ht_cts": int }].
  add column if not exists supplements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(supplements) = 'array');

comment on column public.clients.pays is 'Pays de facturation ISO alpha-2 (FR par défaut).';
comment on column public.clients.reference_obligatoire is 'Refus de facturer une course sans référence client.';
comment on column public.clients.supplements is 'Catalogue de suppléments [{label, prix_ht_cts}] proposés en un clic dans la fiche livraison.';

-- DOWN
-- alter table public.clients
--   drop column if exists supplements, drop column if exists reference_obligatoire,
--   drop column if exists prestation_defaut, drop column if exists vehicule_habituel_id,
--   drop column if exists chauffeur_habituel_id, drop column if exists retrait_tel,
--   drop column if exists retrait_contact, drop column if exists retrait_adresse,
--   drop column if exists pays;
