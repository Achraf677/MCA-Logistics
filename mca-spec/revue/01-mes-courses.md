# 01 — Mes courses

> Un fichier = un onglet. Il fait foi sur CE qu'est l'onglet (cartographie), CE qu'on en
> pense (critique) et CE qui reste à faire (lots). À tenir à jour à chaque PR sur l'onglet.
> Dernière mise à jour : 30/09/2026 (PR #32, lot 1).

## 1. Rôle
- Écran du chauffeur sur le terrain : où aller, quoi faire à chaque arrêt, prouver.
- Sert l'express (course = 1 retrait + 1 livraison, souvent urgente) et devra servir la
  messagerie (tournée de nombreux arrêts / colis, échecs, retours).
- Hors menu des 8 sections : entrée « Mes courses » dans la barre latérale, route
  `/mes-courses`, drapeau `features.config.ts › mesCourses`.
- Cible : téléphone tenu d'une main. Sur PC : même écran (président / DG).

## 2. Qui voit quoi
- Chauffeur : ses courses seulement (RLS `deliveries_select_own` : `driver_id` = sa fiche
  `team_members`). Aucun filtre côté écran.
- Président / DG / comptable : toutes les courses de la société.
  - S'il a une fiche équipe (`team_members.profile_id`) : bascule « Mes courses / Tous les
    chauffeurs », « Mes courses » par défaut.
  - Vue « Tous » : nom du chauffeur sur chaque carte.
- Écritures bornées par `deliveries_update_perm` (président ou droit `livraisons.livraisons:update`).
- Démarrer / terminer une tournée : seulement si `planning.tournees:update` (même règle que
  la RLS `tours_update_perm`), sinon les boutons n'apparaissent pas.
- Aucun montant chargé : pas de prix, pas de TVA, pas de client facturé au-delà du nom.

## 3. L'écran, de haut en bas
- Bouton « Installer l'appli » (PWA), si pas encore installée.
- En-tête, une ligne :
  - ‹ et › (`BoutonIcone`) : période précédente / suivante.
  - Au centre : « Aujourd'hui » ou la date / la semaine, et en dessous « X / N arrêts faits ».
  - Bascule Jour / Sem. (pas de Mois).
  - Bouton Réglages (`BoutonIcone`, roue) → panneau replié : appli GPS (Google Maps, Waze,
    Plans), gardée sur le téléphone (`prefChauffeur`).
  - Sous la ligne : bascule « Mes courses / Tous les chauffeurs » (président / DG avec fiche).
  - « Revenir à aujourd'hui » si on a changé de jour.
- Carte « Prochain arrêt » : type (Retrait / Livraison), client, adresse, « 3 / 12 » et barre
  de progression. Un appui fait défiler jusqu'à la carte de l'arrêt.
- Par jour (titre du jour en mode semaine) :
  - Bandeau du jour (si tournée ou au moins 2 courses à livrer) :
    - tournée : « X sur N », km, durée ; bouton « Itinéraire » (Google Maps multi-arrêts
      depuis le dépôt, péages évités si demandé) ; « Démarrer » / « Terminer » la tournée ;
    - « Plan de chargement » replié : ordre de chargement = inverse de la livraison, poids
      total (les courses non pesées sont annoncées à part).
  - Une carte PAR ARRÊT (pas par course) :
    - en-tête : Retrait (orange) ou Livraison (couleur marque), client, chauffeur (vue Tous),
      flèches ↑ ↓ pour réordonner, pastille d'état (À faire / Vers le retrait / Chargé / Fait) ;
    - adresse en grand, ou « Adresse manquante — à compléter au bureau » en rouge ;
    - « Prévu à 14 h 30 » (livraison) : rouge + « en retard » si dépassé, orange si < 1 h ;
    - nb colis · description · poids ;
    - consignes du bureau (`notes`) dans un encadré ;
    - problème signalé (encadré rouge : motif, heure, note, « Tu peux encore livrer ») ;
    - pièces jointes du bureau (URL signée au clic) ;
    - boutons : Aller (appli GPS), Appeler, Écrire (SMS types : En route, J'arrive, Sur
      place, Personne), Problème, puis le geste principal Démarrer / Charger / Livrer ;
    - « Numéro du client facturé » si pas de contact expéditeur / destinataire saisi ;
    - arrêt fait : carte grisée, « Preuve » si POD.
  - Arrêt mis en avant : bordure marque épaisse (prochain) ou rouge (problème ouvert).
- Bouton flottant « Ticket » (bas droite) → feuille : note + photo → boîte de réception des
  tickets (côté Finance › Charges).

## 4. Les gestes et ce qu'ils écrivent
- Démarrer : `statut` planifiee → en_cours (via `canTransition`).
- Charger (retrait) : parcours de preuve expéditeur → `charge_le`, `expediteur_nom`,
  signatures `lv_signatures.expediteur` (+ transporteur), photos catégorie « Chargement ».
  Le statut ne change pas.
- Livrer : parcours de preuve destinataire → photos « POD », `pod_recipient_name`,
  `pod_captured_at`, `lv_signatures.destinataire` (+ transporteur si pas d'étape de
  chargement), puis `statut` → livree et `probleme_le` remis à null. Preuve écrite AVANT
  le statut (si la preuve échoue, la course reste en cours).
- Parcours de preuve (`EtapeTerrain`) : Photo → Nom → Signature → (Transporteur) → Récap ;
  chaque étape « Passer » ; sortie « Livrer / Charger sans preuve » (ressort ensuite dans
  l'alerte « livraison sans justificatif ») ; « Annuler ».
- Problème (`PanneauProbleme`) : motif (absent, refus, adresse introuvable, accès
  impossible, marchandise endommagée, autre) + note + photo facultative (document
  « Autre ») → `probleme_motif`, `probleme_note`, `probleme_le`. Statut inchangé.
  Cloche : alerte rouge « N échecs de livraison signalés par le chauffeur ».
- Flèches ↑ ↓ : `pickup_order` / `stop_order` (une seule séquence d'arrêts par jour).
- Tournée : `tours.status` → en_cours / terminee.
- Ticket : fichier + note → `receipts_inbox` (statut a_traiter).

## 5. Données lues
- `deliveries` : id, date, statut, description, pickup_address, delivery_address,
  delivery_lat/lng, pod_captured_at, pod_recipient_name, weight_kg, charge_le,
  lv_signatures, expediteur_nom/tel, destinataire_nom/tel, stop_order, pickup_order,
  tour_id, notes, arrival_time, nb_colis, driver_id, probleme_motif/note/le,
  `clients(name, phone)`, `vehicles(label, plate)`, `team_members(full_name)`.
- `documents` (entity_type = delivery) des courses affichées, en une requête.
- `tours` de la période (id, date, status, total_km, total_duration_min, eviter_peages…),
  sans le tracé.
- `companies.depot_lat/lng` ; `team_members.id` de l'utilisateur (filtre).

## 6. Fichiers
- `src/features/mescourses/` : `MesCourses.tsx` (écran, bandeau, carte, pièces jointes,
  ticket), `EtapeTerrain.tsx` (parcours de preuve), `PanneauProbleme.tsx`,
  `mescourses.queries.ts`, `mescourses.logic.ts` (périodes, prochain arrêt, progression,
  horaire, filtre), `etapes.logic.ts` (étape courante d'une course), `*.types.ts`, tests.
- Partagé : `shared/lib/arretsJour` (découpage en arrêts), `ordreArrets` (plan de
  chargement), `poids`, `navigation`, `messageClient`, `prefChauffeur`, `pod.queries`,
  `problemeTerrain`, `receiptsInbox.queries`, `livraisonStatuts`, `tourneeStatuts` ;
  `shared/ui/BoutonIcone` (bouton carré + panneau de réglages).
- Base : migration `20260930090000_deliveries_probleme_terrain.sql`.

## 7. Critique (revue du 30/09/2026)
Bon
- Une carte par arrêt : charger A, charger B, livrer A devient possible et ordonnable.
- Bon numéro au bon moment (expéditeur au retrait, destinataire à la livraison).
- SMS types, appli GPS au choix, itinéraire complet de tournée.
- Parcours de preuve pas à pas, photos envoyées tout de suite, tout est « Passer ».
- Plan de chargement + poids total. Pièces jointes du bureau. Aucun montant.

Pas bon (avant lot 1) — corrigé
- 4 blocs avant le premier arrêt → en-tête sur une ligne + réglages repliés.
- « Mois » inutile → retiré.
- Pas de prochain arrêt → carte « Prochain arrêt » + progression.
- Seul geste de fin « Livrer » → bouton « Problème » avec motif.
- Consignes, heure, nb colis invisibles → affichés sur la carte.
- Aucune urgence express → heure prévue en rouge / orange.
- « Terminer » ambigu → « Livrer / Charger sans preuve ».
- PC : président voit tout mélangé sans nom → bascule + nom du chauffeur.

Pas bon — reste
- PC : toujours une colonne étirée ; pas de vue d'ensemble de l'équipe (carte, qui est où).
- Heure prévue : un seul champ (`arrival_time`) pour la livraison ; pas de créneau
  « entre / avant » ni d'heure de retrait.
- Pas de mode hors-ligne : sans réseau, les gestes échouent.
- Les échecs signalés ne se traitent pas encore depuis Livraisons (seule la cloche les montre).

## 8. Lots
- Lot 1 — FAIT (PR #32) : en-tête compact + `BoutonIcone`, prochain arrêt + progression,
  heure / colis / consignes, bouton Problème + alerte, ticket flottant, filtre chauffeur,
  « sans preuve ».
- Lot 2 — messagerie (à venir) : colis multiples par arrêt (comptage / scan), mode
  hors-ligne (file d'envoi), relivraison et retour dépôt, prise de poste (véhicule + km
  départ / fin → conso L/100).
- Idées PC : vue équipe (carte des chauffeurs, avancement par tournée), créneau horaire
  retrait / livraison, traitement des échecs dans Livraisons (revue de l'onglet Livraisons).

### Ma tournée — lot TC1 « tournée de colis : socle » (17/10/2026, PR à tester)
- Onglet « Ma tournée » (2e de la barre du bas). Pas de tournée : « Scanner ma feuille de
  route » (aujourd'hui seulement) → une photo par page (appareil ou galerie, compressée
  ~130 Ko) → lecture page par page avec progression (Edge `lire-feuille-route`) → aperçu :
  chaque arrêt modifiable (n°, rue, commune, CP, colis, type), supprimer, ajouter ; « à
  vérifier » + motif si la somme des colis d'une ligne ≠ « Nb Colis » ou le nombre de numéros
  ≠ « Nb PGEO » ; secteur (colonne District) en petit sous la rue ; page manquante (« x/y »)
  ou en double signalée ; une page ajoutée après coup ne fait pas perdre les corrections ;
  écart avec l'en-tête signalé ; localisation affichée (numéro / rue / aucune) → « Créer la
  tournée » (arrêts dans l'ordre des pages lues).
- Tournée : compteur collé en haut (arrêts et colis traités / total, livrés · en attente ·
  en retour, collectes), « Prochain : … », arrêts groupés par commune dans l'ordre de la
  feuille. Par arrêt : « Livré » / « Remis » / « Collecté » en un geste ; « … » = autres issues
  selon le type (domicile : avisé, instance, refusé, accès, NPAI, adresse, endommagé · relais :
  fermé, saturé, accès · collecte : rien, non faite, accès), colis remis partiel si > 1 colis,
  note, effacer le statut. Supprimer la tournée (scan raté), scanner une autre feuille.
- Écrit : `tournees_colis` (création, passe « en cours » au 1er geste), `tournees_colis_arrets`.
- Scan v2 (18/10/2026, PR #58) : référentiel de l'outil d'origine (`referentiel_rues`) :
  commune retrouvée par le secteur (page sans bandeau : commune de la page d'avant), nom
  officiel de la rue, position du numéro (sinon voisin du même côté, sinon milieu de rue),
  relais connus, ordre habituel (villages puis rues du fichier). Numéros illisibles : ligne
  ajoutée d'office avec les colis manquants. Rien ne bloque la création (commune / rue
  illisibles → « Commune inconnue » / « Rue illisible »). Aperçu = résumé (arrêts, colis,
  relais, collectes, villages, adresses reconnues, « Rangée dans ton ordre habituel », à
  placer) + « Créer la tournée » ; la liste modifiable est repliée sous « Voir / corriger ».
  Ma tournée : bandeau « Mon ordre habituel » ; picto « Revenir à mon ordre habituel » après
  un calcul. Un arrêt placé à la main enrichit le référentiel.
- Ergonomie une main (18/10/2026, PR #58) : « Ma tournée » pensée pour aller très vite. Barre
  fixe en bas = le prochain arrêt : adresse, « Y aller », gros « Livré » (ou « Remis au relais » /
  « Collecté »), l'issue courante en un appui (Avisé · Relais fermé · Rien à collecter),
  « Autre » ouvre une fiche qui monte du bas (autres issues en gros boutons, colis partiels
  avec − / +, note, photo, annuler le statut). Chaque ligne de la liste : « Livré » en un
  appui, appui sur la ligne = fiche. Plus d'heures estimées ni de textes d'aide ; en tête :
  arrêts, colis, kilomètres, « Recalculer » ; le reste (depuis ici, ordre habituel, partage de
  position) replié sous « Plus ».
- Code couleur (18/10/2026) : classique = bleu, relais = violet, collecte = jaune (bandeau de
  la ligne et de la barre du bas) ; en tête, une barre d'avancement par catégorie présente.
  « Annuler » (8 s) après chaque geste, en gros bouton au-dessus de la barre du bas.
- Lots 2 à 5 (18/10/2026, PR « suite ») :
  - Ordre : bandeau « Ordre de la feuille / par la route (km · durée · gain) / manuel » ;
    « Calculer l'itinéraire » (Edge `optimiser-tournee-colis`), recalcul (picto), « depuis ma
    position » (après le 1er arrêt traité), glisser-déposer par la poignée = ordre manuel,
    « Revenir à l'ordre calculé ». Heure de passage estimée (~08:42) en ordre par la route.
  - Liste : « Prochain arrêt » en tête (Y aller, distance à vol d'oiseau si GPS), à-faire
    groupés par commune dans l'ordre, « Traités » repliés en bas.
  - Carte (Liste / Carte retenu sur le téléphone) : Plan IGN, pastilles numérotées par état,
    picto relais / collecte, « ×n », prochain plus gros, tracé fait estompé, départ marqué,
    « Ma position » (reste sur le téléphone), recentrer, voir tout ; toucher une pastille =
    mêmes gestes que la liste.
  - Arrêts sans adresse trouvée : « Placer » sur la carte ou par l'adresse (BAN).
  - Y aller : application choisie dans Moi (Google Maps, Waze, Plans).
  - Partager ma position avec le bureau (interrupteur, coupé à la fin de la tournée).
  - Photo de preuve par arrêt (« … » › Photo de preuve), voir les photos.
  - « Terminer ma tournée » : résumé, avertit des arrêts non traités (comptés en litige),
    clôture, préremplit la journée de colis en brouillon.
  - Bureau (Tournées) : « Carte du jour » (couleur par salarié, avancement, km, filtre,
    camion = dernière position « il y a 2 min »), calculer l'itinéraire, rouvrir une tournée
    clôturée. Livraisons › relevé de messagerie : « Journées validées : N colis » + Reprendre.
  - Restent : guidage vocal intégré, historique des positions (volontairement absent).

## 9. À tester après chaque PR
- (Scan v2) Scanner une vraie feuille : villages trouvés par le secteur, noms de rue
  officiels, relais reconnus sans « RC », numéros manquants ajoutés (« regarde l'étiquette »),
  tournée créée dans l'ordre habituel sans rien corriger ; placer un arrêt à la main puis
  rescanner : le numéro est trouvé tout seul.
- (Lots 2-5) Calculer l'itinéraire sur une vraie feuille : km / durée crédibles, carte
  lisible ; glisser un arrêt ; Revenir à l'ordre calculé ; placer un arrêt sans adresse ;
  Y aller ouvre la bonne appli ; partager la position et la voir côté bureau ; photo ;
  Terminer → Ma journée préremplie ; bureau : Rouvrir ; relevé du mois → Reprendre.
- (TC1) Scanner une vraie feuille de 2 pages : arrêts dans l'ordre, « (3) » = 3 colis, RC et
  [C] reconnus, lignes de biais marquées « à vérifier » ; Livré en un geste ; partiel ;
  un autre salarié ne voit pas la tournée ; tournée clôturée non modifiable.
- Téléphone, compte chauffeur : Démarrer → Charger (preuve) → Livrer (preuve).
- Problème « Absent » → alerte rouge dans la cloche côté bureau → Livrer → alerte éteinte.
- Heure prévue passée → rouge ; dans l'heure → orange.
- Ticket flottant → apparaît dans Finance › Charges (tickets à traiter).
- PC, président avec fiche : bascule Mes courses / Tous, nom du chauffeur.
- (19/10/2026) Ma tournée : bandeau du haut collé (Liste / Carte / Réinitialiser / Par la fin / Depuis ici /
  Partager), flèches par village, trajet recalculé après chaque changement à la main, double validation de 3 s
  sur Livré / Remis / Collecté, scan lu en arrière-plan (photos envoyées au fil de l'eau, reprise au retour).
  À tester : scanner, fermer la page juste après « Lire », revenir ; « Par la fin » ; « Livré » puis « Annuler ».
