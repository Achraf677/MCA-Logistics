# 04 — Section Planning (Tournées · Planning · Calendrier)

> Revue du 01/10/2026, établie à partir du code ; à compléter avec les captures (PC + mobile).
> Fait foi pour la section ; à mettre à jour à chaque PR qui la touche.

## 1. Rôle
- Organiser le travail des jours à venir : qui roule, avec quel véhicule, quelles courses, dans
  quel ordre. C'est l'écran du gestionnaire d'exploitation (le chauffeur, lui, a Mes courses).
- 3 sous-onglets (`src/app/sections/PlanningSection.tsx`, route `/planning-hub`) :
  - **Tournées** (`features/tournees`) : composer et optimiser la tournée d'un jour, par véhicule ;
  - **Planning** (`features/planning`) : la semaine, une colonne par jour ;
  - **Calendrier** (`features/calendrier`) : le mois, une case par jour.

## 2. Qui voit quoi
- Droits `planning.tournees` / `planning.planning` / `planning.calendrier` (onglet masqué sinon).
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
### Calendrier (mois)
- Mois précédent / suivant ; une case par jour avec les noms de clients ; clic = fiche.

## 4. Gestes et écritures
- Tournées : crée / met à jour `tours` (véhicule, chauffeur, ordre, tracé, km, durée,
  statut) ; écrit `deliveries.tour_id`, `stop_order`, `arrival_time` ; livrer écrit `statut`,
  `delivered_at`, lève `probleme_le` ; Edge `optimize-tour(s)`, `geocode`.
- Planning / Calendrier : lecture seule ; écriture uniquement via la fiche livraison.

## 5. Données lues
- `deliveries` (filtre « sur la route » : ni relevé de messagerie ni forfait), `tours`,
  `vehicles` (actifs), `team_members` (chauffeurs), `companies` (dépôt).

## 6. Fichiers
- `features/tournees/{Tournees,TourCard,ToursOverviewMap}.tsx`, `tournees.{logic,queries,types}.ts`
- `features/planning/{Planning.tsx,planning.queries.ts}` (pas de logic / types : à créer)
- `features/calendrier/Calendrier.tsx` (lit via `livraisons.queries#getDeliveries`)

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
- **Lot P4 — Calendrier** : soit fondu dans le Planning (vue mois de la même grille), soit
  enrichi (échéances flotte, absences). À décider.

## 9. À tester (après chaque lot)
- Semaine avec courses express, relevé de messagerie (absent), forfait (absent).
- Course sans chauffeur → bandeau « À traiter » et colonne « Non affectées ».
- Glisser une course d'un chauffeur à un autre → fiche livraison à jour, Mes courses du
  chauffeur à jour.
- PC 1920 / 1366 sans défilement de page ; mobile 390 en liste.
