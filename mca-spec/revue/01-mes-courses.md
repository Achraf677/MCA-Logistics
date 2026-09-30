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

## 9. À tester après chaque PR
- Téléphone, compte chauffeur : Démarrer → Charger (preuve) → Livrer (preuve).
- Problème « Absent » → alerte rouge dans la cloche côté bureau → Livrer → alerte éteinte.
- Heure prévue passée → rouge ; dans l'heure → orange.
- Ticket flottant → apparaît dans Finance › Charges (tickets à traiter).
- PC, président avec fiche : bascule Mes courses / Tous, nom du chauffeur.
