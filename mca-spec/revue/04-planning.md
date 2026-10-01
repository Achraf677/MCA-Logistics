# 04 — Section Planning (Tournées · Planning)

> Revue du 01/10/2026, établie à partir du code ; à compléter avec les captures (PC + mobile).
> Fait foi pour la section ; à mettre à jour à chaque PR qui la touche.

## 1. Rôle
- Organiser le travail des jours à venir : qui roule, avec quel véhicule, quelles courses, dans
  quel ordre. C'est l'écran du gestionnaire d'exploitation (le chauffeur, lui, a Mes courses).
- 2 sous-onglets (`src/app/sections/PlanningSection.tsx`, route `/planning-hub`) — le Calendrier
  a été fondu dans le Planning (vue « Mois ») le 01/10/2026 :
  - **Tournées** (`features/tournees`) : composer et optimiser la tournée d'un jour, par véhicule ;
  - **Planning** (`features/planning`) : 3 vues — Par chauffeur (semaine), Par jour (semaine),
    Mois (ex-Calendrier : courses + échéances flotte / équipe). Une seule navigation de dates.

## 2. Qui voit quoi
- Droits `planning.tournees` / `planning.planning` (onglet masqué sinon). Le droit
  `planning.calendrier` est retiré (personne ne l'avait, vérifié en base le 01/10/2026).
- Données sous RLS `deliveries` / `tours` : président et DG voient tout ; un chauffeur ne devrait
  pas venir ici (il a Mes courses).

## 3. L'écran de haut en bas
### Tournées
- Date du jour à organiser ; bouton « Localiser les adresses » (géocodage en lot).
- Bloc « Véhicules & chauffeurs » : cocher les véhicules, choisir un chauffeur par véhicule.
- Bloc « Livraisons à répartir » : courses `planifiee` du jour, localisées, cochables,
  ordre modifiable (monter / descendre) ; non localisées grisées.
- Plan de chargement (ordre inverse de livraison).
- Boutons « Répartir et optimiser » (plusieurs véhicules) et « Répartir dans mon ordre ».
- Carte d'ensemble (tracés colorés par véhicule), totaux distance / durée.
- Une carte par tournée (`TourCard`) : arrêts dans l'ordre, heure prévue, « livré HH:MM »,
  Démarrer / Terminer la tournée, éviter les péages, liens Maps / Waze, marquer livré.
### Planning (semaine)
- Semaine précédente / suivante / Aujourd'hui ; compteur « N livraisons cette semaine ».
- PC : 7 colonnes ; chaque course = badge statut, client, chauffeur, montant HT.
- Mobile : liste par jour. Clic = fiche livraison. Bouton « Nouvelle livraison ».
### Planning — vue Mois (ex-Calendrier)
- Mois précédent / suivant ; une case par jour avec les noms de clients ; clic = fiche.

## 4. Gestes et écritures
- Tournées : crée / met à jour `tours` (véhicule, chauffeur, ordre, tracé, km, durée,
  statut) ; écrit `deliveries.tour_id`, `stop_order`, `arrival_time` ; livrer écrit `statut`,
  `delivered_at`, lève `probleme_le` ; Edge `optimize-tour(s)`, `geocode`.
- Planning : écrit `driver_id`, `date` (glisser-déposer, action groupée) ; le reste via la fiche.

## 5. Données lues
- `deliveries` (filtre « sur la route » : ni relevé de messagerie ni forfait), `tours`,
  `vehicles` (actifs), `team_members` (chauffeurs), `companies` (dépôt).

## 6. Fichiers
- `features/tournees/{Tournees,TourCard,ToursOverviewMap}.tsx`, `tournees.{logic,queries,types}.ts`
- `features/planning/{Planning,VueMois}.tsx`, `planning.{logic,queries,types}.ts`, `mois.logic.ts`
  (vue Mois : courses via `livraisons.queries#getDeliveries`, échéances via `getSourcesEcheances`)

## 7. Critique (gestionnaire d'exploitation)
### Ce qui est bien
- Tournées : répartition multi-véhicules + optimisation, plan de chargement, carte, liens GPS,
  péages : solide pour l'express.
- Fiche livraison accessible partout d'un clic.
### Ce qui ne va pas
- **Trois vues qui ne se parlent pas** : le Planning ne montre ni tournée, ni véhicule, ni
  ordre ; la Tournée ne montre pas la semaine ; le Calendrier ne montre que des noms.
- **Planning = vue par jour, pas par ressource** : impossible de voir « qui fait quoi » (une
  ligne par chauffeur / véhicule), ni qui est libre, ni qui est surchargé.
- **Rien n'est affectable depuis le Planning** : changer de chauffeur, de jour ou de véhicule
  oblige à ouvrir chaque fiche (pas de glisser-déposer, pas d'action groupée).
- **Courses non affectées invisibles** : aucune mise en avant des courses sans chauffeur /
  véhicule ni des courses en retard (planifiées dans le passé).
- **Informations manquantes sur les cartes** : créneau, urgent, trajet (ville → ville),
  prestation, nombre de colis ; le montant HT prend la place.
- Tournées ne prend que le statut `planifiee` du jour : une course « en cours » d'une
  tournée d'hier ou replanifiée n'est pas reprise.
- Aptitude / documents chauffeur et véhicule (assurance, CT, permis) ignorés à l'affectation.
- Calendrier : doublon faible du Planning (même info, moins lisible) ; pas d'échéances flotte
  ni d'absences.
- Heures de travail : le début / fin de tournée (Démarrer / Terminer) n'alimente pas Heures.
- Tailles en px fixes (`min-w-[200px]`, `text-[10px]`, `min-h-[120px]`) et
  `text-[var(--fs-*)]` (piège Tailwind) dans les 3 vues.
### À ajouter
- Vue « Ressources » : lignes = chauffeurs (et véhicules), colonnes = jours ; cellule = ses
  courses du jour + total (nb, heures estimées) ; colonne « Non affectées ».
- Glisser-déposer d'une course vers un chauffeur / un jour (écrit `driver_id`, `date`).
- Bandeau « À traiter » : courses sans chauffeur, sans véhicule, sans adresse localisée,
  planifiées dans le passé, échecs à relivrer.
- Cartes enrichies : créneau, urgent, ville → ville, colis ; montant au survol.
- Absences / indisponibilités (congés, véhicule au garage) visibles dans la grille.
- Lien direct « Composer la tournée de ce jour » depuis le Planning.

## 8. Lots proposés
- **Lot P1 — Planning lisible et actionnable** : cartes enrichies (créneau, urgent, trajet,
  colis), bandeau « À traiter », vue par ressource (chauffeurs × jours + Non affectées),
  tient sur un écran PC, rem partout.
- **Lot P2 — Affectation rapide** : glisser-déposer (chauffeur, jour), action groupée
  « affecter à… », contrôle des documents échus à l'affectation.
- **Lot P3 — Tournées** : reprendre les courses `en_cours` / en retard, lien depuis le
  Planning, heures de tournée → Heures (pointage auto).
- **Lot P4 — Calendrier** : enrichi (échéances flotte, absences).

### Fait (PR Planning, 01/10/2026)
- ✔ P1 : vue « Par chauffeur » (lignes chauffeurs + « Non affecté » × 7 jours) et « Par jour » ;
  bandeau « À traiter » (sans chauffeur, sans véhicule, non localisées, en retard) ; cartes
  enrichies (urgent, créneau, ville → ville, colis, statut) ; mobile = liste par jour.
  `planning.{logic,types}.ts` + tests.
- ✔ P2 : glisser-déposer (chauffeur / jour), sélection multiple + « Affecter à… », alerte
  documents échus (permis, visite médicale, CT, assurance) avant d'affecter.
  **Choix** : changer le chauffeur ou le jour d'une course la **détache de sa tournée**
  (tour_id, stop_order, arrival_time à null) → à recomposer dans Tournées.
- ✔ P3 : Tournées reprend les courses planifiées en retard (bouton « Remettre au jour ») ;
  lien `?date=` depuis le Planning ; « Terminer la tournée » propose la ligne d'heures du
  chauffeur. **Limite** : pas de colonne `tours.started_at` → l'heure de début est une
  suggestion (heure de dernière mise à jour de la tournée), à corriger avant d'enregistrer.
- ✔ P4 : Calendrier mois avec pastilles (nb courses, urgentes, sans chauffeur), échéances
  flotte / équipe (CT, assurance, révision, entretiens, permis, visite médicale), filtres
  Tout / Courses / Échéances, tiroir du jour. `calendrier.logic.ts` + 17 tests.
- ✔ Regroupement : Calendrier fondu dans le Planning (vue « Mois », `VueMois.tsx`,
  `mois.logic.ts`, `getSourcesEcheances` dans `planning.queries`) ; échéances (CT, permis…)
  aussi en pastille sur les en-têtes de jour de la semaine ; mobile : « Semaine | Mois ».
  Anciens liens `/calendrier` et `?tab=calendrier` → `?tab=planning&vue=mois`.
- Reste : absences / indisponibilités (pas de table), `tours.started_at` (migration) ;
  le bandeau « À traiter » et l'affectation rapide restent propres aux vues semaine.

## 9. À tester (après chaque lot)
- Semaine avec courses express, relevé de messagerie (absent), forfait (absent).
- Course sans chauffeur → bandeau « À traiter » et colonne « Non affectées ».
- Glisser une course d'un chauffeur à un autre → fiche livraison à jour, Mes courses du
  chauffeur à jour.
- PC 1920 / 1366 sans défilement de page ; mobile 390 en liste.
