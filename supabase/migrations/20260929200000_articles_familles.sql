-- UP
-- Étape 1 du plan « Dépenses véhicule » (mca-spec/tabs/30-depenses-vehicule.md) :
-- produits_vehicule devient la table des ARTICLES des 4 familles, avec leurs
-- réglages. Les articles de base vivent dans le code (produitsVehicule.ts) ;
-- une ligne ici les surcharge (renommage, masquage, suppression, réglages) ou
-- ajoute un article personnalisé (code « x_… »).
alter table public.produits_vehicule drop constraint if exists produits_vehicule_famille_check;
alter table public.produits_vehicule add constraint produits_vehicule_famille_check
  check (famille in ('carburant', 'liquide', 'entretien', 'equipement'));

-- Code : minuscules / chiffres / « _ », les articles de base et les « x_… ».
alter table public.produits_vehicule drop constraint if exists produits_vehicule_code_check;
alter table public.produits_vehicule add constraint produits_vehicule_code_check
  check (code ~ '^[a-z][a-z0-9_]{0,42}$');

alter table public.produits_vehicule
  add column if not exists unite text check (unite in ('L', 'bidon', 'pièce', 'lot', 'prestation')),
  add column if not exists stockable boolean,
  add column if not exists periodicite_km integer check (periodicite_km > 0),
  add column if not exists periodicite_mois integer check (periodicite_mois > 0),
  add column if not exists seuil_stock numeric check (seuil_stock >= 0);

-- DOWN
-- alter table public.produits_vehicule
--   drop column if exists seuil_stock, drop column if exists periodicite_mois,
--   drop column if exists periodicite_km, drop column if exists stockable, drop column if exists unite;
-- delete from public.produits_vehicule where famille in ('entretien', 'equipement');
-- alter table public.produits_vehicule drop constraint if exists produits_vehicule_famille_check;
-- alter table public.produits_vehicule add constraint produits_vehicule_famille_check
--   check (famille in ('carburant', 'liquide'));
