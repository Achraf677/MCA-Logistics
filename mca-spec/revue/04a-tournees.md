# 04a — Tournées (section Planning)

> Cartographie du 04/10/2026, établie à partir du code ET de la base (rien modifié).
> Complète `04-planning.md` (section entière) : ce fichier fait foi pour l'onglet Tournées.
> Plan § 13 de CLAUDE.md. À mettre à jour à chaque PR qui touche l'onglet.

## 1. Rôle
- Préparer la journée d'un ou plusieurs véhicules : quelles courses, dans quel ordre, avec
  quel chauffeur ; obtenir l'itinéraire, le plan de chargement, puis suivre la tournée
  (démarrer, livrer, terminer → heures du chauffeur).
- Écran de bureau (exploitation). Le chauffeur, lui, voit sa tournée dans Mes courses.

## 2. Qui voit quoi
- Onglet : droit `planning.tournees` (route `/planning-hub?tab=tournees`, `PlanningSection.tsx`).
- Base : `tours` et `deliveries` en RLS — lecture : président, DG, comptable = tout ; chauffeur =
  seulement ses lignes (`driver_id`). Écriture `tours` : président ou `planning.tournees/update` ;
  écriture `deliveries` : président ou `livraisons.livraisons/update`.
- **Edge `optimize-tours` et `optimize-tour` : AUCUN contrôle d'appelant** (service role, société
  déduite de la 1re course reçue). Même faille que celle corrigée en U1 pour les synchros.

## 3. L'écran de haut en bas (PC = mobile : une colonne `max-w-3xl`)
1. **Date** (champ date ; `?date=` lu au montage, lien depuis le Planning).
2. **Bandeau géocodage** si le dépôt n'est pas localisé + bouton « Géocoder les adresses
   manquantes » (Edge `geocode` backfill) ; rapport des adresses non résolues.
3. **Véhicules & chauffeurs** : liste des véhicules actifs à cocher, un menu chauffeur par véhicule
   (vide par défaut).
4. **Livraisons à répartir** : courses `planifiee` du jour + courses en retard (planifiées /
   en cours d'un jour passé, hors tournée terminée, 100 max) ; case à cocher, rang, client ·
   description, badges « En retard » / « En cours », adresse de livraison, adresse de retrait,
   repère « localisée » ; flèches monter / descendre (ordre local, non enregistré).
5. **Plan de chargement** (ordre inverse de livraison) dès 2 courses cochées.
6. **Boutons** « Répartir & optimiser » (Edge `optimize-tours`, plusieurs véhicules) et
   « Répartir dans mon ordre » (un seul véhicule, sans calcul) + texte d'explication.
7. **Récap** distance / durée cumulées, **carte d'ensemble** (Leaflet, une couleur par tournée).
8. **Une carte par tournée** (`TourCard`) : véhicule, chauffeur, statut, « x / y livrés » ;
   distance, durée, **carburant estimé à 0,15 €/km** ; Démarrer / Terminer ; « Itinéraire
   complet » (Google Maps) ; case « Éviter les péages » ; plan de chargement repliable (poids) ;
   arrêts : retrait éventuel (case « Passer par l'adresse de retrait »), n°, client, adresse,
   heure prévue « ~ HH:MM » ou « livré HH:MM », flèches d'ordre, Naviguer / Waze, bouton « Livré ».
9. Après « Terminer » : dialogue « Enregistrer les heures du chauffeur » (début = suggestion).

## 4. Gestes et écritures
- Répartir & optimiser → Edge `optimize-tours` : détache TOUTES les courses des tournées de ces
  véhicules ce jour-là + le lot coché, appelle OpenRouteService (Vroom), crée / met à jour
  `tours` (statut `optimisee`, km, durée, tracé), écrit sur chaque course `tour_id`,
  `stop_order`, `arrival_time` (départ fixe 08:00), **`vehicle_id` et `driver_id`** ; supprime les
  tournées devenues vides. Refus 409 si une tournée est déjà en cours / terminée.
  Front ensuite : `date` des courses en retard réparties = jour de la tournée.
- Répartir dans mon ordre (front) : crée / met à jour la tournée `brouillon`, écrit `tour_id`,
  `date`, `stop_order` ; remet km / durée / tracé à null. **N'écrit ni `driver_id` ni
  `vehicle_id` sur les courses.**
- Flèches d'une tournée → `stop_order` (N écritures). Case retrait → `retrait_a_faire`.
  Péages → `tours.eviter_peages`. Démarrer / Terminer → `tours.status`.
- « Livré » (bureau) → `deliveries.statut = livree`, `delivered_at`, `probleme_le = null`
  (sans photo ni signature).
- Heures → `work_hours` (insert, une ligne par chauffeur et par jour au plus).

## 5. Données lues
- `companies` (dépôt), `vehicles` actifs (`label` seulement), `team_members` chauffeurs actifs,
  `deliveries` (filtre « sur la route » : ni messagerie ni forfait), `tours`, `work_hours`.
- Non lus alors qu'ils existent : `deliveries.driver_id` / `vehicle_id` déjà affectés (Planning,
  fiche), `creneau_*`, `urgent`, `nb_colis`, `volume_m3`, `notes` (consignes), retrait
  géocodé (n'existe pas), charge utile du véhicule, échéances documents (permis, CT, assurance).
- **En base (04/10/2026)** : 4 tournées au total (3 `optimisee`, 1 `terminee`), dernière le
  03/10 ; 2 véhicules et 2 chauffeurs actifs ; 8 courses « sur la route » en 60 jours dont 2 en
  tournée ; 0 non géocodée. L'activité actuelle (messagerie) n'y passe pas : l'onglet sert peu.

## 6. Fichiers
- `features/tournees/Tournees.tsx` (627 l.), `TourCard.tsx` (518 l.), `ToursOverviewMap.tsx`,
  `DialogueHeuresTournee.tsx`, `tournees.{logic,queries,types}.ts`, `tours.palette.ts`,
  `tournees.logic.test.ts` ; `shared/lib/tourneeStatuts.ts`.
- Edge : `optimize-tours` (utilisée), `optimize-tour` (**plus appelée par le front**), `geocode`,
  `_shared/ors.ts`.
- Code mort : `optimizeTour`, `getTourStops`, `unassignDeliveries` (queries),
  `eligibleDeliveries`, `canOptimize` (logic) — aucun appelant.

## 7. Critique (gestionnaire d'exploitation)
### Ce qui est bien (à garder)
- Deux promesses claires : « optimiser » (ordre calculé) ou « mon ordre » (ordre humain), dites
  avant le clic.
- Plan de chargement (inverse de la livraison, poids) : utile au dépôt, juste.
- Liens Maps / Waze par arrêt + itinéraire complet ; « éviter les péages » honnête (dit ce qu'il
  ne fait pas).
- Courses en retard reprises (non pré-cochées), replanifiées seulement si réparties.
- Garde 409 : on ne recompose pas une tournée en cours ; réoptimisation idempotente.
- « Terminer » propose la ligne d'heures sans doublon.
- Carte chargée à la demande, cartes mémorisées (perf).
### Ce qui ne va pas
- **Bloquant — sécurité** : `optimize-tours` / `optimize-tour` sans contrôle d'appelant ; un
  compte connecté (chauffeur) peut réécrire l'ordre, le chauffeur et le véhicule des courses.
- **Bloquant — le chauffeur ne voit pas sa tournée** si elle est faite par « Répartir dans mon
  ordre » : `driver_id` n'est pas écrit sur les courses, or Mes courses (RLS) ne montre au
  chauffeur que les courses à son `driver_id`.
- **Double saisie et écrasement** : le chauffeur / véhicule choisis dans le Planning ou la fiche
  ne sont pas repris (menus vides), puis l'optimisation écrase `driver_id` / `vehicle_id` des
  courses sans le dire.
- **L'express est mal servi** : l'optimiseur ne connaît que l'adresse de LIVRAISON (le retrait
  n'est pas localisé ni envoyé) ; une course express = retrait → livraison, l'ordre calculé ne
  tient pas compte du retrait.
- **Heures prévues fausses** : départ fixe 08:00, aucun temps d'arrêt, créneaux de livraison et
  urgence ignorés par l'optimisation ; « ~ 09:12 » affiché comme une vraie heure.
- **Répartition « à parts égales »** (capacité = nombre de courses / nombre de véhicules) : ni
  poids, ni volume, ni charge utile, ni zone.
- **Chiffre inventé** : carburant « 0,15 €/km » codé en dur (ni consommation du véhicule, ni prix
  du gazole des pleins).
- **« Livré » depuis le bureau** sans preuve (photo / signature / nom du réceptionnaire) : la
  course passe livrée et facturable sans justificatif.
- Rien pour **retirer une course d'une tournée** ni **supprimer une tournée** (sauf tout
  réoptimiser).
- Le pool montre des courses déjà dans une tournée sans dire laquelle.
- Contrôle des documents échus (permis, CT, assurance) fait dans le Planning, pas ici.
- `tours.started_at` absent : l'heure de début des heures est une supposition.
- Écran : une colonne étroite sur PC (beaucoup de défilement, ne tient pas sur un écran) ;
  ~50 `text-[var(--fs-*)]` (interdit) ; tailles en px (`h-[420px]`, `max-w-[180px]`,
  `min-h-[44px]`).
### À enlever
- Edge `optimize-tour` (mono-véhicule, plus appelée, sans contrôle) et le code mort listé § 6.
- L'estimation carburant à 0,15 €/km (ou la calculer vraiment, voir lot T3).
### À ajouter
- Reprendre les affectations existantes (chauffeur / véhicule de la course, habituels du client).
- Créneaux et urgence dans le pool et dans l'optimisation ; heure de départ réglable ; temps
  d'arrêt par défaut (à fixer avec toi).
- Retirer une course d'une tournée ; supprimer une tournée vide ou brouillon.
- Vue PC en 2 colonnes (préparation à gauche, carte + tournées à droite).

## 8. Lots proposés
- **T1 — Sécurité et cohérence (sans migration)** : `exigerPermission` + société de l'appelant
  dans `optimize-tours` (`planning.tournees/update`) ; supprimer `optimize-tour` et le code mort ;
  « Répartir dans mon ordre » écrit `driver_id` / `vehicle_id` comme l'optimiseur ; menus
  chauffeur pré-remplis depuis les courses du jour ; avertir avant d'écraser une affectation.
- **T2 — Gérer une tournée** : retirer une course, supprimer une tournée brouillon / optimisée,
  dire dans le pool « déjà dans la tournée de X », contrôle documents échus à l'affectation.
- **T3 — Heures et chiffres justes** : heure de départ choisie, temps d'arrêt, créneaux envoyés à
  l'optimiseur (fenêtres horaires), urgence en tête ; carburant = km × conso du véhicule × prix
  moyen des pleins (ou retiré) ; `tours.started_at` (migration) posé par « Démarrer ».
- **T4 — Express** : géocoder l'adresse de retrait (colonnes `pickup_lat/lng`, migration) et
  envoyer des paires retrait → livraison à l'optimiseur.
- **T5 — Écran** : 2 colonnes PC, tient sur un écran, rem, plus de `text-[var(--fs-*)]`.

### Fait (lot T1, PR en cours, 04/10/2026)
- ✔ `optimize-tours` : `exigerPermission(planning.tournees/update)`, société de l'appelant,
  véhicules et chauffeurs vérifiés (403 sinon), courses d'une autre société ignorées.
- ✔ `optimize-tour` : remplacée par une version qui répond 410 (l'outil ne permet pas de
  supprimer une Edge déployée) ; code mort retiré (`optimizeTour`, `getTourStops`,
  `eligibleDeliveries`, `canOptimize`, `OptimizeResult`). `unassignDeliveries` gardée pour T2.
- ✔ « Répartir dans mon ordre » écrit `driver_id` / `vehicle_id` sur les courses (visibles dans
  Mes courses).
- ✔ Véhicules cochés et chauffeurs pré-remplis à l'ouverture d'une date (tournées du jour, puis
  affectations des courses) : `affectationsSuggerees` ; seuls les véhicules actifs comptent.
- ✔ Avant de répartir : confirmation si des courses ont déjà un autre chauffeur / véhicule
  (`affectationsEcrasees`).
- ✔ Bug : l'avertissement « N non réparties » ne s'affichait jamais (l'Edge renvoie un nombre).
- Décision : temps d'arrêt par défaut = **5 min par livraison** (pour T3, validé le 04/10/2026).

## 9. À tester (après chaque lot)
- Chauffeur connecté : appel direct de `optimize-tours` → 403.
- « Répartir dans mon ordre » avec un chauffeur → les courses apparaissent dans SES Mes courses.
- Course affectée à Pierre dans le Planning → menu Tournées pré-rempli « Pierre ».
- Retirer une course d'une tournée → elle revient dans le pool, `stop_order` à null.
- Course avec créneau 14 h – 16 h → heure prévue dans le créneau.
