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

## 8. Zones de Brumath (27/10/2026)
- Source unique : table `zones_rues` (fichier `Brumath adresses par zone.xlsx`, 151 rues, 1 sud → 7 ouest). Modifier une zone = modifier cette table.
- `appliquer_zones_tournee` (création de tournée, chaque « Recalculer », correction d'adresse) pose `tournees_colis_arrets.zone` : rue du fichier = sa zone ; rue coupée = zone de la feuille si permise, sinon zone du point voisin ; rue absente = zone voisine.
- Edge `optimiser-tournee-colis` : zones 1 → 7 imposées dans la recherche (`penaliserOrdreZones`), un bloc par zone, meilleur point d'entrée / sortie par zone. Tournée du 27/10 : 42,5 → 39,4 km (estimation).
- Reste : 10 rues du référentiel absentes du fichier (zone voisine), ordre des villages de l'Excel, relance du calcul sur les tournées déjà créées.
- À tester : Recalculer une tournée de Brumath → zones 1 → 7 dans la liste et sur la carte, une seule suite de blocs ; ajouter une adresse à Brumath → zone du fichier.
- 28/10/2026 : panne IGN réparée (ressource `bdtopo-valhalla`, `_shared/ign.ts`) ; ordre enregistré même sans tracé ; solveur `ordonnerTournee` : rues d'un seul tenant, numéros rangés. À tester : « Recalculer » la tournée Brumath du jour → zones 1 → 7, une rue faite d'une traite, numéros qui se suivent.
- 28/10/2026 : la carte dessine les limites réelles des zones de Brumath (frontières + étiquettes Z1 → Z7) au lieu d'un contour autour des arrêts. À tester : ouvrir la carte d'une tournée de Brumath → zones coloriées, traits noirs aux frontières, bouton calques pour les cacher.
