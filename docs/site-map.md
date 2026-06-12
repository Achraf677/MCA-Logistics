# Cartographie du site MCA Logistics

> Document de référence (lecture seule) — généré à partir du code réel de `src/features/*`,
> `src/app/routes.tsx`, `src/app/Shell.tsx` et `src/features.config.ts`.
> Aucun changement fonctionnel. Sert de base à l'assistant conversationnel global (étape 1).

## Modèle de rôles & permissions

Type de rôle utilisateur (défini dans `src/app/providers.tsx`) :

```
role: 'president' | 'dg' | 'chauffeur' | 'comptable'
```

- **Gating front réel** : limité. Seuls quelques boutons de **suppression définitive** sont conditionnés à
  `profile?.role === 'president'` — dans **Livraisons** (suppression unitaire + multiple), **Clients**
  (`DrawerClient`) et **Incidents** (`DrawerIncident`).
- **Tout le reste** (qui peut lire/écrire quoi par onglet) est appliqué **côté base par les politiques RLS
  Supabase**, non visibles dans le front. Les fiches ci-dessous indiquent donc « lecture pour tous,
  écritures encadrées par RLS » quand le front ne gate pas explicitement.
- Le rôle `chauffeur` sert surtout au filtrage métier (ex. `team_members` filtrés `role='chauffeur'`
  pour les sélecteurs de chauffeur, validités de conduite dans Équipe).

## Les onglets visibles — 22 (par section de menu)
<!-- 24 à l'origine ; Brouillons IA et Copilote IA retirés en 6B-3 (capacités migrées dans l'assistant). -->


| # | Onglet | Route | Section |
|---|--------|-------|---------|
| 1 | Dashboard | `/` | Pilotage |
| 2 | Rentabilité | `/rentabilite` | Pilotage |
| 3 | Statistiques | `/statistiques` | Pilotage |
| 4 | Livraisons | `/livraisons` | Opérations |
| 5 | Tournées | `/tournees` | Opérations |
| 6 | Planning | `/planning` | Opérations |
| 7 | Calendrier | `/calendrier` | Opérations |
| 8 | Incidents | `/incidents` | Opérations |
| 9 | Inspections | `/inspections` | Opérations |
| 10 | Véhicules | `/vehicules` | Flotte |
| 11 | Carburant | `/carburant` | Flotte |
| 12 | Entretiens | `/entretiens` | Flotte |
| 13 | Clients | `/clients` | Tiers |
| 14 | Fournisseurs | `/fournisseurs` | Tiers |
| 15 | Charges | `/charges` | Finance |
| 16 | Encaissement | `/encaissement` | Finance |
| 17 | Trésorerie | `/tresorerie` | Finance |
| 18 | TVA | `/tva` | Finance |
| 19 | Équipe | `/equipe` | Équipe |
| 20 | Heures | `/heures` | Équipe |
| 21 | Alertes | `/alertes` | Système |
| 22 | Paramètres | `/parametres` | Système |

> **Note (étape 6B-3)** : les onglets **Brouillons IA** (`/brouillons`) et **Copilote IA** (`/copilote`)
> ont été **retirés de la navigation** — leurs capacités (rédaction de mails, import de feuilles de route
> par OCR) sont désormais assurées par **l'assistant conversationnel**. Les features `brouillons/`,
> `copilote/` et leurs Edge Functions (`brouillons-generate`, `ai-extract-deliveries`) restent en place
> car l'assistant réutilise leurs queries. On passe de 24 à **22 onglets visibles**.

---

## Pilotage

### Dashboard
- **Route** : `/` · **Menu** : Pilotage › Dashboard
- **Rôle** : Vue d'accueil synthétique du mois en cours : KPIs d'activité, référentiels actifs, tendance du CA sur 6 mois et dernières livraisons.
- **Données affichées** : KPIs du mois (CA HT, nombre de livraisons, % facturé, % payé) ; compteurs référentiels (véhicules actifs, chauffeurs actifs, clients actifs) ; mini-graphe « CA HT — 6 derniers mois » ; tableau des 8 dernières livraisons (Date, Client, Chauffeur, Montant HT, Statut).
- **Actions & queries** : Lecture seule (aucune écriture propre). Charge via `getDashboardKpis()`, `getRecentDeliveries()`, `getMonthlyTrend()` (`dashboard.queries.ts`). Un clic sur une ligne de livraison ouvre le `DrawerLivraison` de la feature livraisons ; toute édition/transition passe alors par les queries de livraisons.
- **Mode d'emploi** : L'utilisateur consulte d'un coup d'œil l'activité du mois, clique « Voir tout » pour aller aux livraisons, ou clique une ligne pour ouvrir le détail/éditer la livraison.
- **Permissions** : Lecture pour tous ; les écritures éventuelles passent par le drawer livraisons et restent encadrées par RLS. Pas de gating front sur cet onglet.

### Rentabilité
- **Route** : `/rentabilite` · **Menu** : Pilotage › Rentabilité
- **Rôle** : Suivi annuel du résultat brut (CA encaissable moins charges/carburant/entretiens), mois par mois, pour une année sélectionnable.
- **Données affichées** : Sélecteur d'année ; KPIs annuels (CA HT, total charges = charges + carburant + entretiens, résultat brut, taux de marge) ; graphe « Résultat mensuel » (barres positives/négatives) ; tableau 12 mois avec colonnes CA HT, Charges, Carburant, Entretiens, Résultat + ligne Total de l'année.
- **Actions & queries** : Lecture seule, aucune écriture. Charge via `getRentabiliteData(year)` (`rentabilite.queries.ts`) qui lit `deliveries`, `charges`, `fuel_logs`, `vehicle_maintenances`. Agrégation pure dans `rentabilite.logic.ts` : `monthlyRows()`, `annualTotals()`, `margeRatio()`.
- **Mode d'emploi** : L'utilisateur navigue d'une année à l'autre (le bouton suivant est désactivé au-delà de l'année courante) et lit le résultat mensuel et annuel.
- **Permissions** : Onglet financier, lecture pour tous au niveau front (pas de gating) ; l'accès aux données est encadré par RLS côté base.

### Statistiques
- **Route** : `/statistiques` · **Menu** : Pilotage › Statistiques
- **Rôle** : Tableau de bord analytique de l'année courante : CA mensuel, top clients et répartition des charges.
- **Données affichées** : KPIs annuels (CA HT, Charges HT, Carburant, Entretiens) ; graphe « CA HT mensuel » (12 barres) ; Top 5 clients par CA HT (barres de progression) ; charges par catégorie (libellés via `CATEGORY_LABELS`) ; bloc « Résultat estimé » (CA HT, total charges HT, marge brute) affiché seulement si CA > 0.
- **Actions & queries** : Lecture seule, aucune écriture. Charge via `getStatistiquesData()` (`statistiques.queries.ts`, année courante uniquement, non paramétrable) lisant `deliveries`, `charges`, `fuel_logs`, `vehicle_maintenances`. Calculs purs dans `statistiques.logic.ts` : `caMensuel()`, `annualTotals()`, `topClients()`, `chargesByCategory()`.
- **Mode d'emploi** : L'utilisateur consulte les tendances de l'année en cours ; pas de filtre ni de sélecteur d'année.
- **Permissions** : Lecture pour tous au niveau front (pas de gating) ; données encadrées par RLS côté base.

---

## Opérations

### Livraisons
- **Route** : `/livraisons` · **Menu** : Opérations › Livraisons
- **Rôle** : Cœur opérationnel — liste, création, édition, machine à états et facturation des courses, avec resynchronisation Pennylane.
- **Données affichées** : KPIs (Ce mois, CA facturé, À facturer, En attente de paiement) ; bandeau de resync Pennylane si des livraisons sont bloquées ; filtres (date début, date fin, statut) ; tableau (Date, Client, Chauffeur, Montant TTC, km, Statut + bouton Voir), cartes en mobile. Colonne de cases à cocher pour suppression multiple visible uniquement pour le président.
- **Actions & queries** (`livraisons.queries.ts`) :
  - Lister/filtrer : `getDeliveries(filters)`.
  - Créer : `createDelivery()` (via DrawerLivraison, statut initial `planifiee`).
  - Éditer : `updateDelivery()`.
  - Transitions d'état : `transitionDelivery(id, from, to, amount?)` — gardée par `canTransition` (`livraisons.logic.ts`) ; pose `invoiced_at`/`paid_at` ; à `→facturee` invoke l'Edge Function `pennylane-invoice`, sinon `sync_pending=true`.
  - Suppression unitaire : `deleteDelivery(id)` (dans le drawer) ; suppression multiple : `deleteDeliveries(ids)` (barre de sélection). Les statuts `facturee`/`payee` ne sont jamais supprimables (`isDeletable`).
  - Resync Pennylane : `getPendingSyncDeliveries()` + `resyncPending()`.
  - Export CSV : `exportDeliveriesCSV(filters)`.
  - Référentiels du drawer : `getActiveClients()`, `getActiveVehicles()`, `getActiveDrivers()`.
- **Mode d'emploi** : L'utilisateur crée une livraison (onglet Détail puis Montant), suit son cycle de vie dans l'onglet Suivi (Démarrer, Marquer livrée, Facturer, Encaisser, Annuler), et le président peut supprimer une ou plusieurs courses non facturées.
- **Permissions** : Gating front explicite — la suppression (unitaire dans le drawer et multiple via cases à cocher) est réservée à `profile?.role === 'president'` ; la suppression d'une livraison facturée/payée exige en plus une case d'acquittement. Création/édition/transitions affichées pour tous au front, encadrées côté base par RLS (ex. `deliveries_delete_president`).

### Tournées
- **Route** : `/tournees` · **Menu** : Opérations › Tournées
- **Rôle** : Composition et optimisation multi-véhicule des tournées de livraison d'une journée, avec suivi terrain (marquer livré), cycle de vie et carte d'ensemble.
- **Données affichées** : sélecteur de date ; section « Véhicules & chauffeurs » (cases à cocher par véhicule actif + sélecteur de chauffeur par véhicule) ; pool « Livraisons à répartir » (livraisons `planifiee` de la date, géocodées sélectionnables et pré-cochées, non géocodées grisées avec mention « adresse à géocoder ») ; récap distance/durée cumulées ; carte d'ensemble color-codée ; une `TourCard` par tournée. Chaque TourCard montre véhicule, chauffeur, statut (badge brouillon/optimisée/en cours/terminée), distance, durée, carburant estimé (0,15 €/km), compteur « X / N livrés » et la liste ordonnée des arrêts (client, adresse, heure d'arrivée estimée ou heure de livraison réelle). Avertissement si le dépôt n'est pas géocodé ou si des livraisons restent non réparties.
- **Actions & queries** :
  - Référentiels : `getCompanyDepot(companyId)` (`companies` → `depot_lat/lng`), `getActiveVehicles()`, `getActiveDrivers()` (`team_members` filtrés `role='chauffeur'`).
  - Chargement : `fetchPlannableDeliveries(companyId, date)` (pool `planifiee`), `getDeliveriesForDate(companyId, date)` (statuts `planifiee/en_cours/livree` pour les arrêts), `fetchToursByDate(companyId, date)`.
  - Dispatch multi-véhicule : `dispatchAndOptimize(date, assignments, deliveryIds)` invoque l'**Edge Function `optimize-tours`** (corps `{ date, assignments, delivery_ids }`) ; gère le 409 (tournée déjà `en_cours`/`terminee`) en remontant `data.message` ; retourne `{ tours, unassigned }`.
  - Suivi : `markDelivered(deliveryId, when)` passe la livraison à `statut='livree'` + `delivered_at`, gardé en amont par `canTransition` (machine d'états réutilisée depuis `livraisons.logic.ts`).
  - Cycle de vie : `setTourStatus(tourId, status)` pour « Démarrer » (`optimisee → en_cours`, via `canStartTour`) et « Terminer » (`en_cours → terminee`, via `canFinishTour`, avec ConfirmDialog s'il reste des arrêts non livrés).
  - Navigation GPS : liens externes via `googleMapsStopUrl`/`wazeUrl` (arrêt unique) et `googleMapsRouteUrl` (itinéraire complet dépôt → waypoints → dépôt).
  - Queries présentes mais non utilisées par cet écran (héritage mono v1/v2) : `optimizeTour` (Edge Function `optimize-tour` mono), `findTour`, `getTour`, `createTour`, `updateTour`, `assignDeliveries`, `unassignDeliveries`, `getTourStops`.
  - Carte : `ToursOverviewMap` (Leaflet lazy-loadé) décode les polylines (`@mapbox/polyline`), trace une couleur par tournée (`colorForIndex`), place arrêts et dépôt, avec légende véhicule/km/durée.
- **Mode d'emploi** : choisir la date, cocher les véhicules et leur chauffeur, cocher les livraisons géocodées à répartir, cliquer « Répartir & optimiser » ; sur le terrain, « Naviguer »/« Waze » lancent le GPS, « Livré » valide un arrêt, et « Démarrer »/« Terminer » pilotent le statut de la tournée.
- **Permissions** : aucun gating front par rôle dans cet onglet. Lecture pour tous, écritures encadrées par RLS.

### Planning
- **Route** : `/planning` · **Menu** : Opérations › Planning
- **Rôle** : Vue hebdomadaire (semaine glissante lundi→dimanche) des livraisons planifiées.
- **Données affichées** : Navigation semaine (précédent/suivant, Aujourd'hui) avec libellé de plage et compteur de livraisons ; grille 7 colonnes (desktop) ou liste par jour (mobile) ; chaque carte montre statut (Badge), client, chauffeur et montant HT. Les livraisons annulées sont exclues.
- **Actions & queries** : Charge via `getDeliveriesForWeek(dateFrom, dateTo)` (`planning.queries.ts`, exclut `statut = annulee`). Pas d'écriture propre : l'action « nouveau » et le clic sur une carte ouvrent le `DrawerLivraison`, dont les écritures passent par les queries de livraisons.
- **Mode d'emploi** : L'utilisateur navigue de semaine en semaine, clique une carte pour ouvrir/éditer la livraison, ou « + Nouvelle livraison » pour en créer une.
- **Permissions** : Lecture pour tous au front ; écritures via le drawer livraisons (suppression réservée président, reste encadré par RLS).

### Calendrier
- **Route** : `/calendrier` · **Menu** : Opérations › Calendrier
- **Rôle** : Vue mensuelle calendaire des livraisons du mois.
- **Données affichées** : Navigation mois/année (précédent/suivant, Aujourd'hui) + compteur de livraisons du mois ; grille mensuelle (semaines lundi→dimanche, week-end et jour courant mis en évidence) ; par jour, jusqu'à 3 livraisons affichées par nom de client, avec « +N autres » au-delà.
- **Actions & queries** : Réutilise `getDeliveries({ date_from, date_to })` de la feature livraisons (pas de fichier queries propre). Inclut tous les statuts (filtre sur la plage du mois). Pas d'écriture propre : « nouveau » et le clic sur une livraison ouvrent le `DrawerLivraison`.
- **Mode d'emploi** : L'utilisateur navigue de mois en mois, clique une vignette pour ouvrir/éditer la livraison, ou « + Nouvelle livraison » pour en créer une.
- **Permissions** : Lecture pour tous au front ; écritures via le drawer livraisons (suppression réservée président, reste encadré par RLS).

### Incidents
- **Route** : `/incidents` · **Menu** : Opérations › Incidents
- **Rôle** : Registre des incidents de la flotte (accidents, pannes, vols, vandalisme, infractions) avec suivi du statut et des dommages chiffrés.
- **Données affichées** : table Date, Véhicule (label + plaque), Type (badge : accident, panne, vol, vandalisme, infraction, autre), Description, Lieu, Dommages (`damage_cts` formaté), Statut (ouvert/en cours/clos). KPIs : nombre, ouverts, en cours, coût total cumulé. Filtres : plage de dates, type, statut. Le drawer gère en plus chauffeur, responsabilité (`at_fault`), déclaration de police (`police_report`), référence assurance et notes.
- **Actions & queries** : liste via `getIncidents(filters)` (table `incidents`, jointures `vehicles!vehicle_id`, `team_members!driver_id`). Création `createIncident(data)`, mise à jour `updateIncident(id, data)`, suppression `deleteIncident(id)`. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau » pour signaler un incident, ou cliquer une ligne pour l'éditer ; renseigner type, dommages estimés et statut, puis Enregistrer.
- **Permissions** : le bouton « Supprimer » du drawer n'est rendu qu'en édition et si `profile?.role === 'president'`. Sinon lecture pour tous, écritures encadrées par RLS.

### Inspections
- **Route** : `/inspections` · **Menu** : Opérations › Inspections
- **Rôle** : Enregistrement des inspections véhicules (pré-trajet, post-trajet, périodique) via une checklist à 7 points de contrôle.
- **Données affichées** : table Date, Véhicule (label + plaque), Chauffeur, Type (badge), Points NOK (`x/7`), Défauts (texte), Statut (Conforme/Défauts/Refusé). KPIs : nombre, conformes, avec défauts, refusées. Filtres : dates, véhicule, type, statut. La checklist couvre carrosserie, éclairages, pneus, freins, niveaux, documents de bord, propreté ; le statut bascule automatiquement `ok`/`defauts` selon les points cochés (sauf si manuellement `refuse`).
- **Actions & queries** : liste via `getInspections(filters)` (table `vehicle_inspections`, jointures `vehicles!vehicle_id`, `team_members!driver_id`). Création `createInspection(data)`, mise à jour `updateInspection(id, data)`. La query `deleteInspection(id)` existe mais n'est pas câblée à un bouton dans le drawer. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau », choisir véhicule et type, basculer les points de contrôle défectueux (le statut se calcule seul), détailler les défauts si besoin, puis Enregistrer.
- **Permissions** : aucun gating front. Lecture pour tous, écritures encadrées par RLS.

---

## Flotte

### Véhicules
- **Route** : `/vehicules` · **Menu** : Flotte › Véhicules
- **Rôle** : Référentiel de la flotte en vue garage (cartes), avec échéancier réglementaire (contrôle technique, assurance, révision).
- **Données affichées** : cartes par véhicule avec libellé, plaque, statut (Actif/En maintenance/Inactif), marque/modèle/année, kilométrage, carburant, pastille Crit'Air colorée, pastille d'échéance globale (vert ok / orange proche / rouge dépassée). KPIs : véhicules actifs, km total flotte, en maintenance, échéances < 30 j. Filtres : statut, carburant, échéances (proche/dépassée). Le drawer édite aussi PTAC (validé ≤ 3500 kg), prix et date d'achat, et affiche le détail des trois échéances avec jours restants.
- **Actions & queries** : liste via `getVehicles(filters)` (table `vehicles`). Création `createVehicle(data)`, mise à jour `updateVehicle(id, data)` (aussi pour le changement rapide de statut). `getNextMaintenance(vehicleId)` lit la prochaine échéance dans `vehicle_maintenances`. Action `export` présente dans l'ActionBar mais non traitée dans `handleAction`. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau » pour ajouter un véhicule, ou cliquer une carte pour l'éditer ; renseigner immatriculation, échéances et PTAC, puis Enregistrer. Le statut se change via les boutons en haut du drawer.
- **Permissions** : aucun gating front (pas de bouton supprimer ni test de rôle). Lecture pour tous, écritures encadrées par RLS.

### Carburant
- **Route** : `/carburant` · **Menu** : Flotte › Carburant
- **Rôle** : Journal des pleins de carburant avec calcul automatique du total et export CSV.
- **Données affichées** : table Date, Véhicule (label + plaque), Chauffeur, Litres, €/L (`price_per_liter_cts`), Total TTC (`total_cts`), Carburant (badge), km. KPIs : nombre de pleins, total TTC, litres cumulés, prix moyen pondéré par litre. Filtres : dates, véhicule. Le drawer ajoute station, kilométrage, taux de TVA (0 / 5,5 / 20 %) et TVA déductible (100/80/0 %), avec auto-calcul du total à partir de litres × prix/L.
- **Actions & queries** : liste via `getFuelLogs(filters)` (table `fuel_logs`, jointures `vehicles!vehicle_id`, `team_members!driver_id`). Création `createFuelLog(data)`, mise à jour `updateFuelLog(id, data)`. Export CSV `exportFuelCSV(filters)` téléchargé par `downloadCSV`. La query `deleteFuelLog(id)` existe mais n'est pas câblée. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau » pour saisir un plein (litres et prix/L remplissent le total automatiquement), ou « Export » pour télécharger le CSV filtré.
- **Permissions** : aucun gating front. Lecture pour tous, écritures encadrées par RLS.

### Entretiens
- **Route** : `/entretiens` · **Menu** : Flotte › Entretiens
- **Rôle** : Historique des opérations d'entretien/maintenance des véhicules avec suivi des prochaines échéances (date et kilométrage).
- **Données affichées** : table Date, Véhicule (label + plaque), Type (badge : vidange, pneus, freins, contrôle technique, révision, réparation, inspection, autre), Description, Coût (`cost_cts`), km, Prochaine échéance (rouge avec icône si dépassée). KPIs : nombre, coût total, nombre avec échéance, échéances dépassées. Filtres : dates, véhicule, type. Le drawer ajoute prestataire/garage (fournisseur), prochaine date et prochain kilométrage, notes.
- **Actions & queries** : liste via `getMaintenances(filters)` (table `vehicle_maintenances`, jointures `vehicles!vehicle_id`, `suppliers!supplier_id`). Création `createMaintenance(data)`, mise à jour `updateMaintenance(id, data)`. La query `deleteMaintenance(id)` existe mais n'est pas câblée. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau », choisir véhicule et type d'intervention, saisir coût et éventuellement la prochaine échéance, puis Enregistrer.
- **Permissions** : aucun gating front. Lecture pour tous, écritures encadrées par RLS.

---

## Tiers

### Clients
- **Route** : `/clients` · **Menu** : Tiers › Clients
- **Rôle** : Référentiel des clients facturés (coordonnées, tarification, délai de paiement) avec suivi de l'encours et du statut de paiement.
- **Données affichées** : tableau Nom (+ mention « inactif »), Type (badge : Médical / E-commerce / Retail-Palettes / Particulier), Tarif (mode + taux via `getTariffLabel`), Délai (jours), Encours (€), Statut paiement (À jour / Dû / En retard). KPIs : Clients actifs, Médical, E-commerce, Retail/Autres, Encours total, Dont en retard. Drawer à 3 onglets : Détail (SIRET, TVA intra, adresse, e-mail, tél., mode tarifaire, notes), Historique (50 dernières livraisons), Encours & paiements (factures `facturee` avec échéance calculée).
- **Actions & queries** : liste `getClients` ; création `createClient` ; édition `updateClient` ; désactivation (archive `active=false`) `deactivateClient` ; suppression `deleteClient`, précédée du garde-fou `countDeliveriesForClient` (bloquée si livraisons liées) ; export CSV `exportClientsCSV` ; encours liste globale `getFacturedDeliveries` (statut `facturee`) et par client `getClientDeliveries`. Encours calculé en pur via `computeEncours`/`paymentStatusOf` (`clients.logic.ts`). Aucune Edge Function.
- **Mode d'emploi** : « Nouveau » pour créer un client (nom requis, SIRET validé sur 14 chiffres, tarif requis si mode ≠ manuel) ; cliquer une ligne pour éditer, consulter l'historique ou l'encours. « Export » télécharge le CSV.
- **Permissions** : le bouton « Supprimer » du drawer n'apparaît que si `profile?.role === 'president'` ; « Désactiver » est ouvert à tous. Reste lecture pour tous, écritures encadrées par RLS.

### Fournisseurs
- **Route** : `/fournisseurs` · **Menu** : Tiers › Fournisseurs
- **Rôle** : Référentiel des fournisseurs récurrents avec catégorisation et détection anti-doublon par SIREN.
- **Données affichées** : tableau Nom (+ pastille « TVA ✓ » si catégorie carburant), Catégorie (badge), SIRET, E-mail, Téléphone. KPIs : Actifs, Carburant, Entretien, Autres. Drawer : Nom, Catégorie (Carburant/Assurance/Entretien/Sous-traitance/Logiciel/Télécom/Autre), SIREN, SIRET, TVA intra, e-mail, tél., adresse, notes ; encart « Doublon possible » si SIREN déjà présent.
- **Actions & queries** : liste `getSuppliers` ; création `createSupplier` ; édition `updateSupplier` ; désactivation `deactivateSupplier`. Détection doublon en pur via `findDuplicate`/`normalizeSiren` (`fournisseurs.logic.ts`), avec `ConfirmDialog` « Enregistrer quand même ». Pas de suppression ; le bouton « export » de l'ActionBar n'est pas câblé ; aucune Edge Function.
- **Mode d'emploi** : « Nouveau » ouvre le drawer (nom requis) ; si le SIREN existe déjà, un avertissement s'affiche et une confirmation est demandée avant enregistrement ; cliquer une ligne pour éditer ou désactiver.
- **Permissions** : aucun gating front spécifique au rôle ; lecture pour tous, écritures encadrées par RLS.

---

## Finance

### Charges
- **Route** : `/charges` · **Menu** : Finance › Charges
- **Rôle** : Saisie et suivi des charges/dépenses de l'entreprise par catégorie, avec calcul HT/TVA/TTC.
- **Données affichées** : tableau Date, Libellé, Catégorie (badge), Fournisseur (jointure `suppliers.name`), Montant HT, TVA %, Total TTC. KPIs : nombre de charges, Total HT, Total TTC. Drawer : Date, Catégorie (11 valeurs : carburant, assurance, entretien, salaire, logiciel, telecom, loyer, frais_bancaires, comptabilite, publicite, autre), Libellé, Fournisseur (`suppliers` actifs), Montant HT, TVA % (0/5.5/10/20), récapitulatif TVA + TTC, notes.
- **Actions & queries** : liste `getCharges` (filtres catégorie + dates, jointure fournisseur) ; création `createCharge` ; édition `updateCharge` ; export CSV `exportChargesCSV`. `deleteCharge` existe dans les queries mais n'est pas appelé par l'UI. TTC/TVA calculés en pur via `computeTtcCts` (`charges.logic.ts`). Aucune Edge Function (colonnes `pennylane_*` présentes mais non déclenchées ici).
- **Mode d'emploi** : « Nouvelle charge » ouvre le drawer (libellé, date et montant HT > 0 requis) ; le TTC se calcule automatiquement selon le taux de TVA. Filtrer par dates/catégorie et exporter en CSV.
- **Permissions** : aucun gating front par rôle ; lecture pour tous, écritures encadrées par RLS.

### Encaissement
- **Route** : `/encaissement` · **Menu** : Finance › Encaissement
- **Rôle** : Enregistrement des paiements clients reçus, avec rattachement optionnel à une livraison facturée.
- **Données affichées** : tableau Date, Client (jointure `clients.name`), Montant, Mode (badge : Virement/CB/Espèces/Chèque/Autre), Référence, Livraison liée (date de la livraison jointe). KPIs : nombre de paiements, Total encaissé, total Virements. Drawer : Date, Mode, Client, Livraison liée (livraisons `facturee` du client, montant TTC via `effectiveTtcCts`), Montant (auto-rempli depuis la livraison choisie), Référence/n° de chèque, notes.
- **Actions & queries** : liste `getPayments` (filtres mode/client/dates, jointures clients + deliveries) ; création `createPayment` ; édition `updatePayment` ; export CSV `exportPaymentsCSV`. `deletePayment` existe mais n'est pas appelé par l'UI. Les listes déroulantes clients/livraisons sont chargées par requêtes directes `supabase.from('clients'|'deliveries')`. Aucune Edge Function (colonne `qonto_tx_id` posée à `null` à la saisie manuelle).
- **Mode d'emploi** : « Saisir un paiement » ouvre le drawer ; choisir un client (requis), éventuellement la livraison facturée à solder (le montant se pré-remplit), puis le mode et la référence. Filtrer et exporter en CSV.
- **Permissions** : aucun gating front par rôle ; lecture pour tous, écritures encadrées par RLS.

### Trésorerie
- **Route** : `/tresorerie` · **Menu** : Finance › Trésorerie
- **Rôle** : Vue du solde bancaire Qonto et du relevé des transactions, avec rapprochement des paiements clients. Lecture seule côté base — alimentée par des Edge Functions.
- **Données affichées** : KPIs Solde actuel, Solde autorisé, Dernière synchro, nombre de Transactions (depuis le dernier `treasury_snapshots`). Tableau des `qonto_transactions` : Date (`settled_at`), Libellé, Type d'opération (libellé FR via `operationTypeLabel`), Montant signé coloré (`+`/`−`, crédit vert / débit rouge).
- **Actions & queries** : lecture `getLatestSnapshot` (dernier snapshot) et `getTransactions` (relevé Qonto). Bouton « Synchroniser Qonto » → `syncQonto` invoque l'**Edge Function `qonto-sync`**. Bouton « Vérifier les paiements » → `checkPayments` invoque l'**Edge Function `pennylane-payment-check`** (retourne `marked_payee`, nb de livraisons passées payées). Formatage/couleurs en pur dans `tresorerie.logic.ts`.
- **Mode d'emploi** : cliquer « Synchroniser Qonto » pour rafraîchir le solde et les transactions, puis « Vérifier les paiements » pour rapprocher automatiquement les livraisons facturées encaissées et les marquer payées.
- **Permissions** : pas de bouton de mutation directe ni de gating front par rôle ; les écritures se font côté Edge Functions / RLS.

### TVA
- **Route** : `/tva` · **Menu** : Finance › TVA
- **Rôle** : Calcul d'aide à la déclaration de TVA sur une période (trimestre ou mois) : TVA collectée, déductible, et solde net à déclarer.
- **Données affichées** : sélecteur Trimestre (T1–T4) / Mois + année courante. KPIs et tableau de détail : TVA collectée sur ventes, TVA déductible Charges générales, TVA déductible Carburant, « TVA nette à déclarer » (solde, rouge si positif / vert sinon). Mention : calcul sur livraisons au statut « Facturée » ou « Payée ».
- **Actions & queries** : lecture seule `getTvaData(dateFrom, dateTo)` qui agrège en parallèle `deliveries` (statuts `facturee`/`payee`), `charges` et `fuel_logs` sur la période. Calcul en pur via `computeTva` (`tva.logic.ts`) : collectée = `effectiveTtcCts − effectiveHtCts`, déductible charges = somme `tva_cts`, déductible carburant = `tva_cts × tva_deductible_pct/100`. Aucune mutation, aucun export, aucune Edge Function.
- **Mode d'emploi** : choisir le mode (Trimestre ou Mois) et la période ; les montants se recalculent automatiquement. Lecture seule, à vérifier avec le comptable avant déclaration.
- **Permissions** : onglet en lecture seule, aucun gating front par rôle ; périmètre des données encadré par RLS.

---

## Équipe

### Équipe
- **Route** : `/equipe` · **Menu** : Équipe › Équipe
- **Rôle** : Gérer les membres de l'équipe (rôles, contrats, salaires, validités de conduite) et suivre la masse salariale.
- **Données affichées** : KPIs (Membres actifs, Masse salariale/mois, Masse salariale/an, À régulariser). Table : Nom (+ pastille d'échéance pour chauffeurs, mention « (inactif) »), Rôle (`ROLE_LABELS` ou `role_label`), Contrat (badge), Salaire brut/mois, badge Aptitude (« Apte » / « À régulariser »). Filtres : rôle, type de contrat, Actifs uniquement, À régulariser.
- **Actions & queries** : liste `getTeamMembers(filters)` (table `team_members`, tri `full_name`, filtres `active` / `contract_type`) ; création `createTeamMember(data)` ; édition `updateTeamMember(id, data)` ; désactivation `deactivateTeamMember(id)` (passe `active=false`, confirmé par `ConfirmDialog`). Onglet Historique du drawer : `getMemberRecentDeliveries(memberId)` (10 dernières `deliveries` du chauffeur). Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau » ou une ligne pour ouvrir le drawer ; saisir l'identité, le contrat et le salaire (en €, stocké en centimes). Pour un chauffeur, l'onglet « Validités » (permis B, visite médicale) calcule le statut d'aptitude.
- **Permissions** : pas de gate front basé sur le rôle ; lecture pour tous, écritures encadrées par RLS. (L'aptitude « À régulariser » et les validités ne concernent que `role === 'chauffeur'`.)

### Heures
- **Route** : `/heures` · **Menu** : Équipe › Heures
- **Rôle** : Saisir et consulter les heures travaillées par chauffeur, éventuellement rattachées à une livraison.
- **Données affichées** : KPIs (Saisies, Heures totales, Chauffeurs distincts, Avec livraison). Table : Date, Chauffeur (`team_members.full_name`), Début, Fin, Pause (min), Total (durée nette formatée), Livraison (nom client via `deliveries → clients`). Filtres : date début, date fin, chauffeur.
- **Actions & queries** : liste `getWorkHours(filters)` (table `work_hours`, jointures `team_members!member_id` et `deliveries!delivery_id(clients!client_id(name))`, tri date desc puis created_at desc) ; création `createWorkHour(data)` ; édition `updateWorkHour(id, data)`. Le total est calculé côté base (`total_minutes` exclu des Insert/Update) ; le drawer affiche un aperçu « Durée nette » (fin − début − pause). `deleteWorkHour(id)` existe mais n'est pas câblé. Lookups directs (hors queries.ts) : `team_members` actifs + 50 dernières `deliveries`. Aucune Edge Function.
- **Mode d'emploi** : cliquer « Nouveau » pour saisir une journée (date, chauffeur, horaires, pause, livraison optionnelle, notes) ; le total net s'affiche en aperçu. Cliquer une ligne pour la modifier.
- **Permissions** : aucun gate front ; lecture pour tous, écritures encadrées par RLS.

---

## Système

### Alertes
- **Route** : `/alertes` · **Menu** : Système › Alertes
- **Rôle** : Centraliser les alertes opérationnelles (échéances véhicules/chauffeurs, entretiens, retards/impayés, incidents, inspections) détectées en direct, et produire un briefing IA du jour.
- **Données affichées** : résumé du nombre d'alertes actives ; 4 pastilles cliquables par sévérité (Critique, Urgent, À surveiller/warning, Info) avec compteurs ; chips de catégorie (Véhicule, Équipe = chauffeur+rh, Entretien, Livraison, Facture, Incident, Inspection) ; recherche texte ; liste groupée par sévérité (titre, détail, badge sévérité, badge catégorie, échéance lisible « dans/en retard de N j », bouton « Voir → » vers la page liste de la table source).
- **Moteur de détection (`alertes.logic.ts`, fonctions pures)** :
  - `detectAlerts(input, today, thresholds)` agrège 6 détecteurs, déduplique par `id` (`${table}:${id}:${type}`) et trie (sévérité puis dueDate). `summarizeAlerts` agrège les compteurs.
  - Véhicules : CT, assurance, révision (sévérité par seuils `<0` critique / `≤7j` urgent / `≤30j` warning) + statut `maintenance` (info).
  - Chauffeurs : permis B, visite médicale (mêmes seuils) ; fin de CDD proche (catégorie `rh`).
  - Entretiens : `next_due_date` ; Livraisons : retard d'une planifiée + facture impayée (`invoiced_at` + `payment_terms` dépassé) ; Incidents ouverts/en_cours (par âge) ; Inspections `defauts`/`refuse` (urgent).
  - Seuils par défaut `DEFAULT_THRESHOLDS` (urgentDays 7, warningDays 30, lateDeliveryUrgentDays 3, invoiceUrgentDays 15, incidentUrgentDays 14).
- **Actions & queries** : chargement `getAlertesDetectionData()` lit en parallèle des projections de `vehicles`, `team_members`, `vehicle_maintenances`, `deliveries`, `incidents`, `inspections`, puis `detectAlerts` côté client. Bouton « 🧠 Briefing du jour » : `getAlertesBriefing(alerts, today)` invoque l'**Edge Function `alertes-briefing`** (IA Mistral) avec la liste d'alertes (sévérité, catégorie, titre, détail, daysLeft) + la date locale ; affiche `data.data.briefing`, avec actions Régénérer / Fermer. Bouton désactivé si aucune alerte.
- **Mode d'emploi** : la page liste automatiquement toutes les alertes actives ; filtrer par pastille de sévérité, chip de catégorie ou recherche, puis « Voir → » pour ouvrir l'onglet concerné. Cliquer « Briefing du jour » pour une synthèse IA priorisée.
- **Permissions** : aucun gate front ; lecture pour tous, données encadrées par RLS. Pas de mutation (lecture seule + appel Edge Function).

### Brouillons IA — _retiré du menu (6B-3) ; capacité dans l'assistant, query/Edge conservées_
- **Route** : `/brouillons` · **Menu** : Système › Brouillons IA (icône `Bot`)
- **Rôle** : Générer un brouillon de texte rédactionnel (relance impayé, email client, annonce de recrutement ou texte libre) à partir d'une demande en langage naturel, sans accès à la base.
- **Données affichées** : encart RGPD (« N'écris pas de données client sensibles ici (IA gratuite) ») ; sélecteur de type (Relance impayé / Email client / Annonce recrutement / Libre) ; textarea « Ta demande » ; bouton « Générer ». Après génération : le brouillon en `whitespace-pre-wrap` + bouton « Copier ».
- **Edge Function** : `brouillons-generate` (n'écrit rien, ne lit aucune table ; le prompt vient entièrement de l'utilisateur). Invoquée par `generateDraft(prompt, type)` (`brouillons.queries.ts`) via `supabase.functions.invoke('brouillons-generate', { body: { prompt, type } })`.
- **Entrées (payload)** : `{ prompt: string, type: DraftType }` où `DraftType = 'relance' | 'email' | 'annonce' | 'libre'`. Le front envoie `prompt` déjà `.trim()`. Côté Edge Function : `prompt` requis (sinon `400 { ok:false, error:'prompt is required' }`) ; `type` invalide/absent → repli `'libre'`. Chaque type sélectionne un system prompt dédié (transport routier MCA) + consigne commune « réponds uniquement le brouillon prêt à copier, en français, sans préambule… sans inventer de noms/montants/coordonnées non fournis ».
- **Sorties (réponse)** : succès `{ ok: true, data: { text: string } }` ; échec `{ ok: false, error: string }` (+ `status`, `body` si erreur API externe `502`). Front : si `error`/`data.ok === false` → toast ; sinon `setResult(data.data.text ?? '')` ; texte vide → `EmptyState`. « Copier » écrit `result` dans le presse-papiers.
- **Modèle IA** : Mistral, `mistral-large-latest` (`_shared/mistral.ts`, fonction `generateText`), chat completions, `temperature 0.3`, `max_tokens 900`, timeout 30 s. Clé via `MISTRAL_API_KEY` (`Deno.env`), jamais logguée ni renvoyée.
- **Actions & queries** : une seule fonction, `generateDraft(prompt, type)` ; aucune écriture ni lecture base (le brouillon n'est pas persisté — affiché et copiable uniquement).
- **Mode d'emploi** : choisir un type de texte, décrire sa demande, cliquer « Générer » ; le brouillon s'affiche et peut être copié via « Copier ». Rien n'est enregistré en base : résultat éphémère, à coller manuellement ailleurs (ex. dans un mail).
- **Permissions** : onglet routé/affiché seulement si `features.brouillons` est activé (guard `routes.tsx` + filtrage menu `Shell.tsx`). Aucune écriture base donc pas de RLS impliquée ; seul garde-fou = la note RGPD (IA gratuite).
- **⭐ Note migration assistant** : capacité destinée à être déplacée dans l'assistant conversationnel. Contrat homogène `{ ok, data?, error? }`, fonction réutilisable `generateDraft(prompt, type)`.

### Copilote IA — _retiré du menu (6B-3) ; capacité dans l'assistant, query/Edge conservées_
- **Route** : `/copilote` · **Menu** : Système › Copilote IA (icône `ScanText`)
- **Rôle** : Extraire automatiquement les livraisons d'une feuille de route (texte collé, image ou PDF) via OCR/IA, les présenter en tableau éditable, puis créer les livraisons (et clients manquants) en base après validation manuelle.
- **Données affichées** : encart RGPD (« Le document est envoyé à Mistral (UE)… ») ; zone d'import de fichier (image/PDF, max ~8 Mo) OU textarea pour coller le texte ; textarea « Précisions pour l'IA » ; bouton « Analyser ». Après analyse : tableau de lignes proposées (Créer/Client/Chauffeur/Véhicule/Date/Type/Enlèvement/Livraison/Km/Poids/Montant HT €/Heure/Statut), champs manquants surlignés en orange, case « Créer » par ligne, bouton « Créer les N livraison(s) cochée(s) ».
- **Edge Function** : `ai-extract-deliveries` (lecture seule stricte, n'écrit rien en base). Invoquée par `extractDeliveries(input)` (`copilote.queries.ts`) via `supabase.functions.invoke('ai-extract-deliveries', { body: input })`.
- **Entrées (payload)** — type `ExtractInput` (`copilote.types.ts`), envoyé tel quel dans `body` :
  - `text?: string` — texte collé (utilisé si pas de fichier).
  - `fileBase64?: string` — fichier en base64 **sans** le préfixe `data:...;base64,` (le front retire la partie avant la virgule).
  - `mimeType?: string` — type MIME (`image/*` ou `application/pdf`).
  - `instructions?: string` — précisions libres (`undefined` si vide).
  - Logique : si `fileBase64` + `mimeType` → on envoie le fichier (pas le `text`) ; sinon → `text`. Côté Edge Function : si fichier → reconstruit `data:${mimeType};base64,${fileBase64}` et fait l'OCR ; sinon utilise `text`. Si ni l'un ni l'autre → `400 { ok:false, error:'text or file required' }`.
- **Sorties (réponse)** — type `ExtractResponse` :
  - Succès : `{ ok: true, data: { deliveries: ExtractedDelivery[], raw_text: string } }`.
  - Échec : `{ ok: false, error: string }` (+ éventuellement `status`, `body` si erreur API externe `502`).
  - Chaque `ExtractedDelivery` : `{ client_name, type ('medical'|'ecommerce'|'retail'|'particulier'|null), date (YYYY-MM-DD|null), pickup_address, delivery_address, km (number|null), weight_kg (number|null), montant_ht_eur (number|null), heure (string|null), driver_name (string|null), vehicle (string|null — plaque OU nom), notes (string), missing (string[]) }`.
  - Exploitation front (`CopiloteIA.tsx`) : si `error`/`data.ok === false` → toast. Sinon lit `data.data.deliveries`, et `buildRow()` construit une ligne éditable — matching client par nom normalisé (sinon « ➕ Créer »), chauffeur (`matchDriver`), véhicule (`matchVehicle` par label OU plaque) ; lignes « vides » (`isEmptyRow`) non cochées par défaut ; champs `missing` surlignés. `raw_text` non réutilisé côté UI.
- **Modèle IA** : Mistral (UE). Génération JSON via `generateJson` et OCR via `ocrDocument` (`_shared/mistral.ts`). Modèle visible dans le helper committé : `mistral-large-latest` (chat, `temperature 0.3`, `max_tokens 900`). ⚠️ **Discrepance repo** : `generateJson` et `ocrDocument` sont importés par `ai-extract-deliveries` mais **absents** de la version committée de `_shared/mistral.ts` (qui n'exporte que `generateText`) — le modèle OCR exact et les paramètres de `generateJson` ne sont donc pas vérifiables dans ce repo en l'état.
- **Actions & queries** (`copilote.queries.ts`) :
  - Référentiels (lecture, RLS) : `listClients()` (`clients` actifs : id, name, type), `listDrivers()` (`team_members` actifs : id, full_name), `listVehicles()` (`vehicles` : id, label, plate).
  - Création client : `createClientRow({ company_id, name, type })` → insert `clients`, renvoie `id`.
  - Création livraison : `createDeliveryRow(NewDelivery)` → insère dans `deliveries` en écrivant **uniquement** `amount_ht_cts`, `tva_cts`, `amount_ttc_cts` (calculés depuis `montant_ht_cts` + `tva_rate`) ; ne touche jamais aux colonnes legacy `montant_*`. Statut via `computeStatut(date)` (`planifiee` si date future, sinon `livree`) ; l'heure est persistée en préfixe des notes. Insertion séquentielle avec arrêt propre en cas d'erreur.
- **Mode d'emploi** : l'utilisateur importe un fichier (image/PDF) ou colle le texte de la feuille de route, ajoute éventuellement des précisions, puis « Analyser ». L'IA renvoie des livraisons proposées en tableau éditable ; il vérifie/complète les champs orange, choisit un client existant ou la création d'un nouveau, assigne chauffeur/véhicule, coche les lignes voulues, puis « Créer les N livraison(s) cochée(s) » — c'est seulement à ce moment que clients manquants et livraisons sont écrits en base.
- **Permissions** : onglet routé/affiché seulement si `features.copilote` est activé. La création exige `companyId` (issu de `useProfile()`) sinon toast d'erreur. Aucune autre vérification de rôle côté front ; les écritures (`clients`, `deliveries`) sont encadrées par la RLS (filtrage par `company_id`).
- **⭐ Note migration assistant** : capacité destinée à être déplacée dans l'assistant conversationnel. Contrat homogène `{ ok, data?, error? }`, fonction réutilisable `extractDeliveries(input)`. La validation/création reste un acte manuel à conserver (l'Edge Function n'écrit rien elle-même).

### Paramètres
- **Route** : `/parametres` · **Menu** : Système › Paramètres
- **Rôle** : Éditer la fiche société (identité légale, coordonnées/dépôt géocodé, informations bancaires).
- **Données affichées** : bandeau société (nom, SIREN). Sections : Identité légale (Raison sociale, SIREN, SIRET, N° TVA intra, Capital social en €), Coordonnées (adresse du dépôt avec autocomplétion + lat/lng affichés), Informations bancaires (IBAN formaté, BIC/SWIFT). Bouton « Enregistrer les modifications » actif uniquement si le formulaire est `dirty`.
- **Actions & queries** : chargement `getCompany(companyId)` (table `companies` : id, name, siren, siret, tva_intra, address, depot_lat, depot_lng, capital_cts, iban, bic) ; enregistrement `updateCompany(companyId, data)`. Capital saisi en € → stocké en centimes (`capital_cts`). L'adresse passe par `AddressAutocomplete` (Photon) qui renseigne `depot_lat`/`depot_lng` à la sélection. Aucune Edge Function.
- **Mode d'emploi** : modifier les champs de la société puis « Enregistrer les modifications » (désactivé tant qu'aucun champ n'a changé). Sélectionner une adresse dans l'autocomplétion pour géocoder le dépôt.
- **Permissions** : aucun gate front basé sur le rôle (édition possible dès que `companyId` est chargé) ; écritures encadrées par RLS.

---

## Annexes

### Edge Functions référencées
| Fonction | Onglet | Rôle |
|----------|--------|------|
| `pennylane-invoice` | Livraisons | Crée la facture Pennylane à la transition `→facturee` |
| `pennylane-payment-check` | Trésorerie | Marque payées les livraisons encaissées (`marked_payee`) |
| `qonto-sync` | Trésorerie | Synchronise solde + transactions Qonto |
| `optimize-tour` | Tournées (mono, héritage) | Optimise une tournée d'un véhicule |
| `optimize-tours` | Tournées (multi) | Dispatch + optimisation multi-véhicule |
| `alertes-briefing` | Alertes | Briefing IA du jour (Mistral) |
| `brouillons-generate` | Brouillons IA | Génère un brouillon de texte (Mistral) |
| `ai-extract-deliveries` | Copilote IA | OCR/extraction de feuilles de route (Mistral) |

### Observations transverses (état du code, sans jugement)
- Plusieurs queries de suppression existent mais ne sont **pas câblées** à un bouton dans l'UI : `deleteInspection`, `deleteFuelLog`, `deleteMaintenance`, `deleteCharge`, `deletePayment`, `deleteWorkHour`.
- Boutons « export » présents dans l'ActionBar mais **non traités** dans `handleAction` pour : Véhicules, Fournisseurs.
- Le seul gating front par rôle réel : bouton **Supprimer** réservé `président` dans Livraisons, Clients, Incidents.
- Convention montants : tout en centimes (`*_cts`) ; colonnes legacy `montant_*` jamais écrites (cf. `CLAUDE.md`).
