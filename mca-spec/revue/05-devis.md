# 05 — Devis (section Livraisons)

> Revue du 02/10/2026, établie à partir du code et de la base (2 devis en prod, tous
> « transformé »). Fait foi pour l'onglet ; à mettre à jour à chaque PR qui le touche.

## 1. Rôle
- Chiffrer une prestation avant de la faire, l'envoyer au client (via Pennylane), suivre la
  réponse, puis la transformer en course(s) ou la facturer directement.
- En messagerie : le devis = **proposition de prix au colis** ; une fois accepté, ce prix
  devient le tarif du client (une seule saisie).

## 2. Qui voit quoi
- Droit `livraisons.devis` (voir / créer / modifier / supprimer). Transformer en livraison
  exige aussi `livraisons.livraisons / create`. L'Edge `pennylane-quote` revérifie les droits.

## 3. L'écran de haut en bas
- Liste (PC tableau, mobile cartes) : date, n° Pennylane, client, description, TTC, validité
  (signe si dépassée), statut. Aucun filtre, aucune recherche, aucun total.
- Tiroir étroit (`max-w-xl`) : client, date, validité (+30 j), description, adresses départ /
  livraison, véhicule, chauffeur, HT, taux TVA, TVA (modifiable), récap TTC, notes.
- Actions selon le statut : brouillon → Enregistrer / Envoyer chez Pennylane ; envoyé →
  Accepté / Refusé ; accepté → Transformer en livraison / Facturer directement / Refusé.

## 4. Gestes et écritures
- `quotes` : insert / update / delete (front) ; `pennylane_quote_id`, numéro, `envoye`,
  `facture` écrits par l'Edge `pennylane-quote`.
- Transformer : insert `deliveries` (`quote_id`) en `planifiee` à la date du jour, puis
  `quotes.statut = transforme`.
- Lecteurs ailleurs : alertes (`brouillon`, `envoye`), clients (compte des devis).

## 5. Données lues
- `quotes` (+ `clients.name`), `clients` actifs, `vehicles` actifs, `team_members` actifs.
- Edge : `clients` (nom, e-mail, adresse) — pas `pays`, pas `tva_intra`.

## 6. Fichiers
- `features/devis/{Devis,DrawerDevis}.tsx`, `devis.{logic,queries,types}.ts`
- `supabase/functions/pennylane-quote/index.ts`

## 7. Critique (gestionnaire)
### Ce qui est bien
- Cycle clair brouillon → envoyé → accepté → livraison / facture.
- Edge solide : droits revérifiés, idempotente, refuse de facturer un devis non accepté,
  signale « créé chez Pennylane mais pas en base ».
- Suppression avec avertissement quand le devis existe chez Pennylane.
### Ce qui ne va pas
- **Bloquant — pas de messagerie** : ni prestation, ni nombre de colis, ni prix au colis.
  Impossible de chiffrer l'activité actuelle autrement qu'en texte libre.
- **Double saisie** : le prix ne vient pas du tarif client (`tariff_mode` / `tariff_rate_cts`)
  et un devis accepté ne met pas à jour ce tarif.
- **Une seule ligne** : pas de suppléments (attente, hayon, étage) alors que la fiche client
  les porte déjà ; pas de quantité × prix unitaire.
- **Client étranger faux chez Pennylane** : l'Edge crée le client en FR sans n° TVA, ignore
  `clients.pays` et l'autoliquidation.
- **Transformer en livraison pauvre** : date = aujourd'hui (en UTC), ne reprend ni
  prestation, colis, référence client, créneaux, contacts, ni suppléments ; crée la course
  en aveugle au lieu d'ouvrir la fiche pré-remplie.
- Statut « expiré » jamais posé (seulement un signe dans la liste) ; aucune date
  d'acceptation ; aucune relance des devis envoyés sans réponse.
- TVA saisissable à la main (écart possible avec le taux) ; dates calculées en UTC au
  chargement du module (`TODAY` figé).
- Liste sans filtres / recherche / totaux (montant en attente, taux de transformation).
- Tiroir hors modèle « fiche de saisie » ; `text-[var(--fs-*)]` interdit ; caractère ⚠.

## 8. Lots proposés
- **Lot D1 — Devis = fiche de prix** (migration additive sur `quotes`) : prestation,
  quantité × prix unitaire (colis / km / forfait), suppléments (lignes, comme
  `extra_lines`), référence client ; prix proposé depuis le tarif client ; TVA /
  autoliquidation déduites du client ; tiroir au modèle fiche livraison ; dates locales.
- **Lot D2 — Devis accepté → effets** : « Transformer » ouvre la fiche livraison pré-remplie
  (tout repris, date choisie) ; en messagerie, « Appliquer ce prix au client » écrit
  `tariff_mode = colis` + `tariff_rate_cts` (une seule saisie ensuite).
- **Lot D3 — Pennylane** : lignes multiples (quantité, PU, suppléments), pays + n° TVA du
  client, autoliquidation ; date d'acceptation.
- **Lot D4 — Liste** : filtres statut, recherche, totaux (en attente, acceptés, taux de
  transformation), expiration posée automatiquement, relance « envoyé depuis > 7 j ».

### Fait (PR #41, 02/10/2026)
- ✔ D1 : migration `20261002090000_quotes_fiche_prix` (prestation, unite, quantite,
  prix_unitaire_cts, extra_lines, reference_client, autoliquidation, accepte_le) ; tiroir
  2 colonnes (Client et prestation · Trajet et exécution · Prix) ; prix proposé depuis le tarif
  client ; suppléments du client en un clic (`shared/ui/LignesSupplementaires`, partagé avec la
  fiche livraison) ; autoliquidation déduite (pays + n° TVA) ; un seul taux pour le devis ;
  dates locales ; `devis.logic.test.ts` (14 tests). Liste lisible même sans la migration (42703).
- ✔ D2 : « Créer la course » à la date choisie (tout repris : prestation, référence, adresses,
  exécution, colis / km, suppléments) puis ouverture de la fiche dans Livraisons
  (`?ouvrir=<id>`) ; « Appliquer ce prix au client » (écrit `clients.tariff_mode`,
  `tariff_rate_cts`, `prestation_defaut`) ; messagerie : pas de course ni de facture directe ;
  date d'acceptation affichée.
- ✔ Uniformisation avec la fiche livraison (même PR) : mêmes blocs (Devis · Retrait ·
  Livraison · Trajet · Marchandise · Exécution & prix · Note), mêmes composants partagés
  (`shared/ui/FicheSaisie`, `LignesSupplementaires`), mêmes défauts client (prestation, retrait
  + contact, chauffeur / véhicule habituels, autoliquidation, référence obligatoire), trajet IGN
  automatique (au km : quantité = km, une seule saisie), mêmes colonnes que `deliveries`
  (expediteur_* / destinataire_*, marchandise_desc, nb_colis, poids_kg, volume_m3, km) reprises
  à la création de la course ; liste : recherche, filtre statut / client, montant en attente.
- D3 = lot U3 (03/10/2026) : lignes Pennylane du devis = lignes de facture (quantité × PU,
  suppléments, autoliquidation + mention, réf. client), TVA ligne par ligne à l'écran.
- Reste : D4 : expiration automatique,
  relance des devis envoyés > 7 j.

## 9. À tester (après chaque lot)
- Devis messagerie 1 € / colis × 3 000 colis → HT 3 000 € ; accepté → tarif client à jour ;
  relevé du mois suivant pré-rempli à 1 €.
- Devis express avec supplément « attente » → 2 lignes chez Pennylane.
- Client UE (DE) → Pennylane en DE avec n° TVA, autoliquidation.
- Transformer → fiche livraison ouverte, tout repris, date modifiable.
