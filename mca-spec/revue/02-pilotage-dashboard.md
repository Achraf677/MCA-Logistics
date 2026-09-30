# 02 — Pilotage › Dashboard

> Un fichier = un onglet (plan fixe, modèle `01-mes-courses.md`).
> Dernière mise à jour : 30/09/2026 (revue, avant lot 1).

## 1. Rôle
- Écran d'accueil de l'app (`/` et `/pilotage`) : savoir en 10 secondes où en est la société.
- Section Pilotage = ce seul écran (Rentabilité et Statistiques retirées, redondantes).
- Doit servir l'express (courses du jour, urgences) et la messagerie (tournées, échecs).

## 2. Qui voit quoi
- `/` n'a AUCUN garde : tout compte connecté atterrit ici, chauffeur compris.
- Chiffres filtrés par la RLS : un chauffeur voit « CA HT du mois » calculé sur SES courses,
  et le bouton « + Nouvelle livraison ».
- Président / DG / comptable : toute la société.

## 3. L'écran, de haut en bas
- Titre « Vue d'ensemble » (28 px) + « Activité du mois · mise à jour à l'instant » (point
  vert décoratif) ; bouton « + Nouvelle livraison » (tiroir Livraisons).
- 3 KPI (2 colonnes sur mobile → le 3e seul sur sa ligne) :
  - CA HT du mois (évolution vs mois précédent, mini-courbe) ;
  - Livraisons du mois (toutes, y compris planifiées) ;
  - Facturées / total du mois, barre de progression.
- Courbe « Chiffre d'affaires HT » : 6 mois / 12 mois / Année.
- « Référentiels » : véhicules actifs, chauffeurs actifs, clients actifs (liens).
- « Dernières livraisons » : 8 lignes triées par date décroissante (tableau PC : date,
  client, chauffeur, montant HT, statut ; cartes sur mobile) → ouvre le tiroir livraison.

## 4. Gestes et écritures
- Aucun écrit direct. « + Nouvelle livraison » et un clic sur une ligne ouvrent le tiroir
  Livraisons (création / modification).
- Liens vers Flotte, Équipe, Tiers, Livraisons.

## 5. Données lues
- `deliveries` du mois (amount_ht_cts, statut), hors annulées.
- `vehicles` / `team_members` / `clients` : comptes des actifs.
- Courbe : 2 requêtes PAR MOIS (livraisons + charges) → 12 requêtes en 6 mois, 24 en 12 mois.
  Les charges sont chargées puis jamais affichées.
- 8 dernières livraisons avec `*` (toutes les colonnes) + client, véhicule, chauffeur.

## 6. Fichiers
- `src/features/dashboard/Dashboard.tsx`, `dashboard.queries.ts` (dont `getActionItems`,
  ~70 lignes, code mort).
- `src/app/sections/PilotageSection.tsx`.
- Dette d'architecture baselinée : importe `livraisons` (tiroir, `formatCents`,
  `STATUS_LABELS`, types).
- Partagé : `KpiCard`, `LineChart`, `DriverAvatar`, `money.effectiveHtCts`.

## 7. Critique (30/09/2026)
Bon
- Chargement parallèle, squelettes, tiroir livraison chargé à la demande.
- Courbe CA lisible, choix de période simple.
- Dernières livraisons : tableau sur PC, cartes sur mobile, ouverture directe.
- « À traiter » retiré au profit de la cloche : pas de doublon.

Pas bon
- BUG dates : bornes du mois calculées en UTC depuis minuit heure de Paris → le « mois »
  va du dernier jour du mois précédent à l'avant-dernier jour du mois (ex. octobre =
  30/09 → 30/10). CA du mois et courbe faux aux bords.
- Chauffeur : atterrit sur le Dashboard avec un CA et « Nouvelle livraison » → contraire à
  la règle « aucun montant pour un chauffeur ». Il devrait arriver sur Mes courses.
- Rien sur AUJOURD'HUI : ni courses du jour, ni en cours, ni en retard, ni échecs signalés.
  Pour de l'express, c'est la première question du matin.
- Rien sur l'argent qui compte : reste à facturer (livrées non facturées), à encaisser /
  en retard, solde bancaire, marge (les charges sont chargées mais pas montrées).
- « Référentiels » (nb véhicules / chauffeurs / clients) : chiffres qui ne bougent pas,
  aucune décision derrière.
- « Dernières livraisons » triées par date : les courses futures planifiées passent devant.
- En-tête : 28 px de titre + faux « mis à jour à l'instant ».
- Mobile : 3 KPI sur 2 colonnes, le 3e orphelin ; le tableau et la courbe arrivent loin.
- Perf : 12 à 24 requêtes pour la courbe, `select *` sur les dernières livraisons, code mort.

## 8. Lots
- Lot 1 (proposé) :
  - corriger les bornes de mois (dates locales, fonction pure testée) ;
  - chauffeur → redirigé sur Mes courses depuis `/` ;
  - bloc « Aujourd'hui » : à faire / en cours / livrées / en retard / échecs signalés,
    cliquable (→ Livraisons / Calendrier) ;
  - KPI argent : CA HT du mois · Reste à facturer (livrées non facturées) · À encaisser
    (dont en retard) · Marge du mois (CA − charges HT) ;
  - « Référentiels » supprimé ; « Dernières livraisons » = dernières modifiées / du jour ;
  - en-tête compact (salutation + date du jour, bouton Nouvelle livraison),
    réglages de la courbe derrière `BoutonIcone` ;
  - courbe : 2 requêtes au total (plage entière, regroupement en JS dans `*.logic.ts`),
    suppression du code mort.
- Lot 2 (plus tard) : solde Qonto + prévision 30 j (depuis Trésorerie), carte des
  chauffeurs du jour, indicateurs messagerie (taux d'échec, colis / tournée).

## 9. À tester après chaque PR
- Dernier / premier jour du mois : la course apparaît dans le bon mois.
- Compte chauffeur : ouvre l'app → Mes courses, jamais de montant.
- Bloc Aujourd'hui : chiffres = Livraisons filtrées sur aujourd'hui ; échec signalé visible.
- KPI : reste à facturer = Livraisons « livrées » ; à encaisser = « facturées ».
