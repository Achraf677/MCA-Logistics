# 10 — Flotte (Véhicules, Carburant, Entretiens)

> Un fichier = un onglet. Fait foi. Dernière mise à jour : 30/10/2026 (lot 3 Entretiens HT).

## 1. Rôle
- Véhicules : parc, échéances (CT, assurance, révision), km. Carburant : pleins Pennylane (`fuel_logs`). Entretiens : interventions (`vehicle_maintenances`).

## 2. Décisions validées (22/10/2026)
- Tout en HT sauf trésorerie ; entretiens existants saisis en TTC → reprise ticket par ticket (IA propose, le président valide, ticket mixte ventilé par lui) ; TVA repas 100 % ; tables Inspections / Incidents supprimées ; pas d'immobilisation ni de prorata km ; Export Véhicules réparé.
- Fiche véhicule : date et prix d'achat retirés de l'écran (colonnes gardées en base).

## 3. Plan
- Lot 1 Véhicules (FAIT, PR #111) · Lot 2 Carburant HT (fait, PR en cours) · Lot 3 Entretiens HT (fait, PR en cours). Ancien texte : Lot 2 Carburant en HT (`fuel_logs.total_ht_cts`, conso L/100) · Lot 3 Entretiens en HT + reprise ticket par ticket.
- Coût HT 12 mois sur la carte véhicule : à brancher aux lots 2 / 3 (le HT n'existe pas encore en base).
- ⚠ Le carburant vit aussi dans Finance › Justificatifs › Carburant (tickets carte carburant + `pleins_carburant`, PR #100-#106) : décider au lot 2 ce que compte l'onglet Flotte.

## 4. Écran Véhicules (lot 1)
- 4 tuiles cliquables (`ChiffreCarte`, comptent sur l'ensemble) : Actifs · En maintenance · Échéances (proches / dépassées) · À renseigner (CT ou assurance manquants).
- `BarreRecherche` (nom, plaque, marque, modèle), `ListeDeroulante` statut / carburant, pastille « Échéances proches », « Tout réinitialiser ». Filtres côté client (`vehicules.logic#filtrerVehicules`).
- Carte : avatar, plaque, statut, dernier km connu (le plus grand entre la fiche et les pleins / entretiens, `kmConnus`), carburant, Crit'Air, résumé d'échéance (`resumeEcheance` : retard en rouge clair, proche / à renseigner en ambre, à jour). Marque / modèle non répétés si le nom les contient.
- Fiche : listes déroulantes (carburant, Crit'Air), plus de prix / date d'achat.
- Export CSV : une ligne par véhicule de la liste affichée, textes protégés (« ; » et guillemets), dernier km connu ; téléchargement robuste (`downloadCSV`).
- Données lues : `vehicles`, `fuel_logs.mileage_km`, `vehicle_maintenances.mileage_km`. Écrit : `vehicles`.

## 5. Fichiers
- `features/vehicules/{Vehicules,DrawerVehicule}.tsx`, `vehicules.logic.ts` (+ test), `vehicules.queries.ts`.

## 6. Données (vérifiées en base le 29/10/2026)
- `vehicles` 4 lignes (0 CT / 0 assurance renseignés sur 3). `fuel_logs` 70, TTC seulement. `vehicle_maintenances` 17, TTC, sans km ni échéance. `incidents` / `vehicle_inspections` : 0 ligne, suppression faite à la main via MCP au « merge » (`drop table public.incidents; drop table public.vehicle_inspections;`, sans fichier : le CI interdit DROP dans les migrations). DOWN : recréer les tables vides (colonnes dans l'historique des migrations 20260616…).

## 7. À tester
- Tuile « À renseigner » → liste des véhicules sans CT / assurance ; « Tout réinitialiser » ; Export ouvre un CSV lisible dans Excel ; fiche : choisir carburant et Crit'Air.

## 8. Écran Carburant (lot 2, 30/10/2026)
- Base : `fuel_logs` (pleins Pennylane). Colonne `total_ht_cts` (nullable ; repli `htDuPlein` = TTC − TVA). Le TTC (`total_cts`, `price_per_liter_milli`) reste stocké pour Pennylane / trésorerie.
- Reprise des 70 pleins : plein seul sur sa facture = `charges.montant_ht_cts` ; plein partagé = TTC − TVA du plein ; pas de TVA = TTC. 2 pleins avec un TTC saisi différent de la facture (à vérifier par le président).
- 4 tuiles cliquables : Achats (à rapprocher) · Total · Litres · Prix moy./L. Liste déroulante **HT / TTC** à gauche de « Nouveau » (`shared/ui/AffichageMontant`, choix mémorisé sur l'appareil, `Shell.actionsGauche`) : tuiles, tableau et mobile suivent. Le TTC est le montant payé (`total_cts`).
- **Km retirés (demande du 30/10/2026)** : plus de colonne km, plus de saisie du kilométrage (fiche plein, import de relevé) ; plus de conso L/100 (tuile et code supprimés). Les km déjà saisis restent en base (lus par la carte Véhicules).
- Barre de recherche (véhicule, plaque, chauffeur, station), listes déroulantes véhicule / produit, pastille « À rapprocher », « Tout réinitialiser ». Tableau et mobile en HT. Export CSV : HT + colonne TTC en dernier.
- Écritures : `DrawerCarburant` et `DrawerReleve` posent `total_ht_cts`. Lecteur adapté : outil assistant `get_carburant_mois` (`total_ht_eur`).
- Hors périmètre : tickets carte carburant et pleins manuels (Finance › Justificatifs › Carburant, TTC, aucun HT en base).

## 9. Écran Entretiens (lot 3, 30/10/2026)
- Colonnes `vehicle_maintenances.cost_ht_cts`, `tva_cts`, `ht_verifie_le` (migration `20261030100000` appliquée). `cost_cts` = TTC reste écrit à chaque enregistrement. Avant : `cost_cts` était TTC si une facture était liée et HT sinon (mélange corrigé : tout passe par le HT).
- Reprise des 17 entretiens : HT et TVA de la facture Pennylane liée (17 / 17, une opération = une facture). Aucune n'est vérifiée : le président valide ticket par ticket (✔ dans la ligne, ou « Valider » dans la fiche ; optimiste). Pas d'IA pour le HT : Pennylane le donne exactement. L'IA ne lit que le km (`lire-facture`, à la demande, inchangé).
- 4 tuiles cliquables : À vérifier · Interventions · Total HT · Échéances (dépassées en rouge). Recherche, listes déroulantes, pastilles « À vérifier » et « À rapprocher », « Tout réinitialiser ».
- Fiche : HT saisi ou repris de la facture, TVA auto 20 % modifiable, TTC « pour info » ; véhicule et prestataire en `ListeDeroulante`.
- Récap « Où part l'argent » en HT : les ventilations de factures (TTC) sont ramenées au HT au même taux (`enHt`). Ticket mixte : ventilation par le président, inchangée.
- Lecteurs de `cost_cts` hors onglet : aucun (vérifié par grep).
