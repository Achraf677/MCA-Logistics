# 04 — Planning (Tournées · Planning)

Fait foi pour la section. Mis à jour le 22/10/2026 (refonte de l'onglet Planning du 19/10 ; Tournées de colis du jour : voir `04a-tournees.md`).

## 1. Rôle
- Écran du bureau : qui roule, avec quoi, quelles courses. Le chauffeur a Mes courses.
- `/planning-hub` : 2 sous-onglets — **Tournées** (composer / optimiser l'express) · **Planning** (3 vues).

## 2. Droits
- `planning.planning` (voir). Écrire (glisser, cocher, menu, nouvelle course) = `planning.planning` update.
- Bloc « Tournées de colis » : lecture via `planning.tournees` ; sans le droit, il n'apparaît pas.

## 3. Écran Planning (`features/planning`)
- Barre : ‹ période › · Aujourd'hui · **Jour | Semaine | Mois** (mémorisé, `planning.vue2`) · roue de réglages.
- Réglages (par navigateur) : afficher les terminées (défaut non) · seuil de surcharge (défaut 8 courses / chauffeur / jour).
- Bandeau « À traiter » : sans chauffeur · sans véhicule · non localisées · en retard · échecs (filtres).
- **Jour** (`VueAujourdhui`) : tuiles (courses, à faire, en cours, livrées, terminées) · blocs En retard
  (+ « Tout remettre à aujourd'hui »), Échéances (dépassées ou ≤ 14 j), Tournées de colis (avancement, colis, km)
  · une ligne par chauffeur (charge, courses) ; « Non affecté » en rouge. Mobile : sections repliables.
- **Semaine** (`VueSemaine`, PC) : chauffeurs × 7 jours, une case = nombre + points colorés (1 point = 1 course),
  case teintée selon la charge ; clic = ouvre le jour ; points glissables. Mobile : bande des 7 jours + liste du jour.
- **Mois** (`VueMois`) : inchangé, + erreurs affichées, plus de doublon de lecture des échéances.
- Carte de course (2 lignes) : client + trajet · créneau, colis, véhicule, statut. Menu « … » : affecter, jour, fiche.
- Couleurs : à faire gris · en cours bleu · livrée jaune · terminée atténuée · rouge = action requise.

## 4. Écritures
- `deliveries.driver_id` / `date` (glisser, menu, action groupée) ; la course quitte sa tournée (tour_id, stop_order,
  arrival_time à null). Garde base : jamais sur facturée / payée / annulée. Le nombre de lignes écrites est contrôlé.

## 5. Données
- `deliveries` (filtre `prestation.is.null,prestation.not.in.(messagerie,forfait)`), `team_members`, `vehicles`,
  `vehicle_maintenances` (échéances), `tournees_colis` + `tournees_colis_arrets` (lecture, `shared/lib/tourneesColis.queries`).
- Retards : 120 derniers jours, 500 max.

## 6. Fichiers
- `Planning.tsx` (orchestration, chargement protégé contre les réponses tardives), `VueAujourdhui.tsx`, `VueSemaine.tsx`,
  `VueMois.tsx`, `CarteCourse.tsx`, `MenuCourse.tsx`, `planning.{logic,queries,types}.ts`, `mois.logic.ts`.

## 7. Décisions
- Vue « Par jour » supprimée (doublon). Absences / congés / heures / positions en direct : hors planning (pas de table, CNIL, déjà dans Tournées).
- Changer chauffeur ou jour détache de la tournée (point ouvert).

## 8. Reste
- Absences (nouvelle table à valider) · seuil de charge partagé entre appareils · Mois mobile à ouvrir sur aujourd'hui.

## 9. À tester
- Jour : retards, échéances, tournée de colis du jour, chauffeur libre, surcharge au-delà du seuil.
- Menu « … » : affecter, Demain ; course facturée (menu absent) ; compte en lecture seule (aucun geste).
- Semaine PC : glisser un point vers une autre case ; clic sur une case → vue Jour.
- Mobile 390 : bande des jours, sections repliables, feuille d'actions.
