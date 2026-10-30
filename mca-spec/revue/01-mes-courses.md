# 01 — Mes courses


> 22/10/2026 : l'ancien écran des courses express (OngletCourses, étapes terrain, signalement de problème, ordre des arrêts du jour) est SUPPRIMÉ. Mes courses = Aujourd'hui (récap colis) · Ma tournée · Dépenses · Moi. Tout ce qui décrit l'express plus bas est historique.

> Un fichier = un onglet. Il fait foi sur CE qu'est l'onglet (cartographie), CE qu'on en
> pense (critique) et CE qui reste à faire (lots). À tenir à jour à chaque PR sur l'onglet.
> Dernière mise à jour : 22/10/2026 (Ma tournée : zones de Brumath, recherche d'adresse, pause, clôture avec photos).

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

### Ma tournée (messagerie : tournée de colis) — état au 22/10/2026
- Mes courses (salarié) = 4 onglets : Aujourd'hui · **Ma tournée** · Dépenses · Moi (« Ma journée » supprimée le 19/10 :
  le relevé du mois compte les colis des tournées terminées).
- **Scan** : « Scanner ma feuille de route » (aujourd'hui) → une photo par page (appareil ou galerie), envoyées une par
  une, lecture en arrière-plan (Edge `scanner-feuille-route`, on peut quitter la page) → aperçu résumé (arrêts, colis,
  relais, collectes, villages, adresses reconnues, à placer ; liste modifiable repliée) → « Créer la tournée »
  (rien ne bloque ; « Supprimer ce scan »). Référentiel `referentiel_rues` : commune par le secteur, nom officiel de la
  rue, position du numéro, relais, ordre habituel ; numéros illisibles = ligne ajoutée d'office. Brumath : zones 1 à 7
  lues dans la colonne District ; rues du fichier Excel connues d'avance. Calcul de l'ordre lancé automatiquement.
- **Bandeau du haut collé** : recherche d'adresse (cherche dans les arrêts, ouvre la fiche, « + » ajoute une adresse :
  village choisi dans la liste du référentiel, rue proposée, CP et zone repris de la tournée), arrêts, km, boutons
  Liste / Carte / **Recalculer** / Par la fin / Depuis ici / Partager, arrêts en pause.
- **Ordre** : par la route, village par village (zone par zone à Brumath : zone 1 d'abord, zone 7 à la fin), ou
  manuel (glisser, flèches par village, « Par la fin ») ; tout changement à la main refait km / tracé (mode `suivre`).
  Chaque village / zone a sa couleur (bandeau de groupe, pastilles, contour, route, légende de la carte).
- **Par arrêt** : « Livré » / « Remis » / « Collecté » en un geste (double confirmation sur le même bouton, annulation
  8 s), « Autre » = fiche (issues selon le type, colis partiels avec case par colis, note, photo de preuve, Y aller),
  **Pause** (bloc « En pause » en haut, Reprendre), pastille « N colis », code couleur bleu / relais violet / collecte jaune,
  horaires des relais La Poste, **crayon = Modifier l'adresse** (ligne et fiche).
- Carte : Plan IGN, pastilles numérotées, départ, tracé fait estompé, ma position, placer un arrêt sans adresse.
- Partager ma position avec le bureau (interrupteur, coupé à la fin). Y aller : Google Maps par défaut (choix dans Moi).
- **Terminer ma tournée** : feuille avec résumé, arrêts non traités (comptés en litige) et photos de la synthèse
  (appareil ou galerie, plusieurs) ; clôture ; plus rien de modifiable (le bureau peut rouvrir).
- Écrit : `tournees_colis` (création, passe « en cours » au 1er geste), `tournees_colis_arrets` (statuts, `colis_remis`,
  `en_pause_le`, `zone`, adresse corrigée / ajoutée), `positions_livreurs`, `documents` (photos d'arrêt, synthèse),
  `referentiel_rues` (position d'un arrêt placé, zone apprise, via fonctions `security definer`).
- Bureau : voir `04a-tournees.md` (Tournées de colis du jour : carte, liste des arrêts, correction, calcul, rouvrir).
- Restent : guidage vocal intégré ; historique des positions (volontairement absent) ; information CNIL sur le partage
  de position.

- 30/10/2026 : carte de Ma tournée interactive : toucher un point = même barre que le point actuel (Y aller, Livré, issue rapide, Pause, Autre) + « Viser cet arrêt » (passe l'arrêt en tête de l'ordre, mode manuel, trajet recalculé). Arrêts traités / en pause : ligne habituelle.

- 30/10/2026 : « Depuis ici » (recalcul des restants) repart du dernier arrêt traité, plus du GPS du téléphone.

- 30/10/2026 : photo de la synthèse OBLIGATOIRE pour terminer ; scan de la feuille du jour bloqué tant qu'une tournée passée (depuis le 30/10) n'est pas terminée avec photo ; message d'information le jour même.

## 9. À tester après chaque PR
- (Ma tournée) Scanner une vraie feuille (2 pages) : villages / zones trouvés, relais reconnus, tournée créée dans
  l'ordre sans rien corriger ; fermer la page juste après « Lire » puis revenir ; Brumath : « Recalculer » range les
  zones de 1 à 7, couleurs sur la liste et la carte.
- Livré en un geste (double confirmation), partiel (colis décochés), Annuler, Pause puis Reprendre, crayon d'adresse
  (ligne et fiche), recherche + ajout d'une adresse (village de la liste), Terminer avec photos de synthèse (appareil +
  galerie) ; un autre salarié ne voit pas la tournée ; tournée clôturée non modifiable ; bureau : Rouvrir.
- Téléphone, compte chauffeur : Démarrer → Charger (preuve) → Livrer (preuve).
- Problème « Absent » → alerte rouge dans la cloche côté bureau → Livrer → alerte éteinte.
- Heure prévue passée → rouge ; dans l'heure → orange.
- Ticket flottant → apparaît dans Finance › Charges (tickets à traiter).
- PC, président avec fiche : bascule Mes courses / Tous, nom du chauffeur.
