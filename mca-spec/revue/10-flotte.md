# 10 — Flotte (Véhicules, Carburant, Entretiens)

> Un fichier = un onglet. Fait foi. Dernière mise à jour : 29/10/2026 (lot 1 Véhicules).

## 1. Rôle
- Véhicules : parc, échéances (CT, assurance, révision), km. Carburant : pleins Pennylane (`fuel_logs`). Entretiens : interventions (`vehicle_maintenances`).

## 2. Décisions validées (22/10/2026)
- Tout en HT sauf trésorerie ; entretiens existants saisis en TTC → reprise ticket par ticket (IA propose, le président valide, ticket mixte ventilé par lui) ; TVA repas 100 % ; tables Inspections / Incidents supprimées ; pas d'immobilisation ni de prorata km ; Export Véhicules réparé.
- Fiche véhicule : date et prix d'achat retirés de l'écran (colonnes gardées en base).

## 3. Plan
- Lot 1 Véhicules (fait, PR en cours) · Lot 2 Carburant en HT (`fuel_logs.total_ht_cts`, conso L/100) · Lot 3 Entretiens en HT + reprise ticket par ticket.
- Coût HT 12 mois sur la carte véhicule : à brancher aux lots 2 / 3 (le HT n'existe pas encore en base).
- ⚠ Le carburant vit aussi dans Finance › Justificatifs › Carburant (tickets carte carburant + `pleins_carburant`, PR #100-#106) : décider au lot 2 ce que compte l'onglet Flotte.

## 4. Écran Véhicules (lot 1)
- 4 tuiles cliquables (`ChiffreCarte`, comptent sur l'ensemble) : Actifs · En maintenance · Échéances (proches / dépassées) · À renseigner (CT ou assurance manquants).
- `BarreRecherche` (nom, plaque, marque, modèle), `ListeDeroulante` statut / carburant, pastille « Échéances proches », « Tout réinitialiser ». Filtres côté client (`vehicules.logic#filtrerVehicules`).
- Carte : avatar, plaque, statut, dernier km connu (le plus grand entre la fiche et les pleins / entretiens, `kmConnus`), carburant, Crit'Air, résumé d'échéance (`resumeEcheance` : retard, proche, à renseigner, à jour). Marque / modèle non répétés si le nom les contient.
- Fiche : listes déroulantes (carburant, Crit'Air), plus de prix / date d'achat.
- Export CSV : une ligne par véhicule de la liste affichée, textes protégés (« ; » et guillemets), dernier km connu ; téléchargement robuste (`downloadCSV`).
- Données lues : `vehicles`, `fuel_logs.mileage_km`, `vehicle_maintenances.mileage_km`. Écrit : `vehicles`.

## 5. Fichiers
- `features/vehicules/{Vehicules,DrawerVehicule}.tsx`, `vehicules.logic.ts` (+ test), `vehicules.queries.ts`.

## 6. Données (vérifiées en base le 29/10/2026)
- `vehicles` 4 lignes (0 CT / 0 assurance renseignés sur 3). `fuel_logs` 70, TTC seulement. `vehicle_maintenances` 17, TTC, sans km ni échéance. `incidents` / `vehicle_inspections` : 0 ligne, suppression faite à la main via MCP au « merge » (`drop table public.incidents; drop table public.vehicle_inspections;`, sans fichier : le CI interdit DROP dans les migrations). DOWN : recréer les tables vides (colonnes dans l'historique des migrations 20260616…).

## 7. À tester
- Tuile « À renseigner » → liste des véhicules sans CT / assurance ; « Tout réinitialiser » ; Export ouvre un CSV lisible dans Excel ; fiche : choisir carburant et Crit'Air.
