# 04a — Tournées (section Planning)

> Refonte du 22/10/2026 : l'onglet ne gère plus que les **tournées de colis**. L'express n'a plus de composeur
> (décision « retrait express complet »). Fait foi pour l'onglet ; `04-planning.md` pour le reste de la section.

## 1. Rôle
- Le bureau suit les feuilles de route de colis d'un jour : avancement, colis livrés / en attente / en retour, km,
  positions des livreurs, adresses à corriger, photos de la feuille et de la synthèse.
- Les courses express restent des `deliveries` : on les affecte dans Planning (Jour / Semaine / Mois).

## 2. Qui voit quoi
- Onglet : droit `planning.tournees` (`/planning-hub?tab=tournees&date=AAAA-MM-JJ`).
- Scanner pour un salarié / corriger / recalculer / rouvrir : `planning.tournees` update. Supprimer : delete.

## 3. L'écran
- Barre : ‹ date › · Aujourd'hui · Carte du jour · Export CSV · Scanner pour un salarié.
- 6 tuiles cliquables (filtre) : Tournées · En cours · Clôturées · En attente · En retour · Kilomètres.
- Filtres : recherche (salarié, client), salarié. Liste : une carte par tournée (avancement, compteurs, pauses, km, position).
- Clic = tiroir : onglets **Arrêts** (liste, correction d'adresse, Recalculer) · **Feuille de route** (pages scannées,
  gardées à vie) · **Synthèse** (photos de fin de tournée). Actions : calculer l'itinéraire, rouvrir, supprimer.
- Carte du jour : un marqueur / tracé par salarié, positions (< 3 h), mise à jour toutes les 30 s (aujourd'hui seulement).
- Planning › Jour : le bloc « Tournées de colis » renvoie ici (« Ouvrir → », même date).

## 4. Données
- Lit : `tournees_colis`, `tournees_colis_arrets`, `documents` (`entity_type = 'tournee_colis'`, `notes` = `feuille` | `synthese`),
  `positions_livreurs`. Écrit : via `shared/lib/tourneesColis.queries` (calcul = Edge `optimiser-tournee-colis`).
- `tours` / `tour_stops` : plus utilisés (gardés en base). Edge `optimize-tours` = 410.

## 5. Fichiers
- `Tournees.tsx` (page + tiroir), `tournees.logic.ts` (+ test : lignes, résumé, filtres, CSV, date), `ListeTourneeColis.tsx`, `tours.palette.ts`.

## 6. Reste
- Feuilles de route côté salarié (Mes courses › Ma tournée) : pas encore affichées (le salarié peut lire les siennes, la base l'autorise).
- Avant le 22/10/2026 les photos de feuille étaient effacées : seules les tournées créées après sont conservées.

## 7. À tester
- Tuiles : un clic filtre, un second revient à « toutes ». Export CSV du jour (Excel FR).
- Tiroir : Arrêts / Feuille de route / Synthèse ; Rouvrir une clôturée ; Supprimer une non clôturée.
- Scanner une feuille : à la création, les pages apparaissent dans Feuille de route.
- Mobile 390 : boutons sans retour à la ligne, tuiles sur 2 colonnes.
