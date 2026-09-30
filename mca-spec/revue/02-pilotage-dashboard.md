# 02 — Pilotage › Dashboard

> Un fichier = un onglet (plan fixe, modèle `01-mes-courses.md`).
> Dernière mise à jour : 30/09/2026 (lot 1).

## 1. Rôle
- Écran d'accueil de l'app (`/` et `/pilotage`) : savoir en 10 secondes où en est la société.
- Section Pilotage = ce seul écran (Rentabilité et Statistiques retirées, redondantes).
- Doit servir l'express (courses du jour, urgences) et la messagerie (tournées, échecs).

## 2. Qui voit quoi
- Chauffeur : renvoyé sur Mes courses depuis `/` et `/pilotage` (jamais de montant).
- Président / DG / comptable : toute la société (RLS).

## 3. L'écran, de haut en bas
- Pensé pour tenir sur UN écran PC (1080p) sans défiler ; sur mobile, une colonne.
- Ligne 1 : « Bonjour <prénom> · date du jour » + « + Nouvelle livraison ».
- Ligne 2 (PC : 2 blocs côte à côte) :
  - « Aujourd'hui » : 5 cases cliquables (→ Livraisons) À faire · En cours · Livrées ·
    Retard (heure prévue dépassée ou course d'un jour passé encore ouverte) · Échecs
    (signalés par un chauffeur) ; rouge si > 0 ; lien « Planning » → Calendrier ;
  - 3 chiffres, arrondis à l'euro, cliquables : CA HT du mois (évolution vs mois dernier)
    → Livraisons · Reste à facturer (livrées non facturées, HT) → Livraisons ·
    À encaisser (facturées, TTC, « dont X en retard » selon délai client) → Encaissement.
    Libellés courts sur mobile (« CA du mois », « À facturer »).
- Ligne 3 (PC : 2 colonnes) :
  - « Chiffre d'affaires HT » en BARRES mensuelles (`shared/ui/BarresMensuelles`,
    valeur en k€ au-dessus, mois en cours en couleur marque) ; période 6 / 12 mois /
    depuis janvier derrière le `BoutonIcone` Réglages ; barres plus basses sur mobile ;
  - « Activité récente » : 6 dernières livraisons modifiées (client, date · chauffeur,
    montant, statut) → tiroir livraison.
- Retiré : marge du mois (à la demande), « Référentiels », courbe lissée.

## 4. Gestes et écritures
- Aucun écrit direct : « Nouvelle livraison » et un clic sur une ligne ouvrent le tiroir
  Livraisons. Tout le reste = navigation.

## 5. Données lues (une vague parallèle de 5 requêtes, plus aucune par mois)
- `deliveries` des 12 derniers mois (date, statut, amount_ht_cts) → barres et CA,
  découpés en mémoire.
- `deliveries` du jour + ouvertes des jours passés (date, statut, arrival_time, probleme_le).
- `deliveries` livrées (amount_ht_cts) ; facturées (invoiced_at, amount_ttc_cts,
  `clients.payment_terms`, 30 j par défaut).
- 6 dernières modifiées (`*` + client, véhicule, chauffeur) pour le tiroir.

## 6. Fichiers
- `src/features/dashboard/Dashboard.tsx`, `dashboard.queries.ts`, `dashboard.logic.ts`
  (+ tests : bornes de mois en heure locale, agrégation, journée, encaissement).
- `src/app/sections/PilotageSection.tsx` (renvoi chauffeur).
- Dette baselinée : importe `livraisons` (tiroir, libellés de statut, type).
- Partagé : `BarresMensuelles`, `BoutonIcone`, `Badge`, `money`.

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
- Lot 1 — FAIT (PR feat/revue-dashboard) :
  - corriger les bornes de mois (dates locales, fonction pure testée) ;
  - chauffeur → redirigé sur Mes courses depuis `/` ;
  - bloc « Aujourd'hui » : à faire / en cours / livrées / en retard / échecs signalés,
    cliquable (→ Livraisons / Calendrier) ;
  - chiffres argent : CA HT du mois · Reste à facturer · À encaisser (dont en retard) ;
    marge retirée à la demande ;
  - mise en page sur un écran, barres mensuelles au lieu de la courbe lissée ;
  - « Référentiels » supprimé ; « Dernières livraisons » = dernières modifiées / du jour ;
  - en-tête compact (salutation + date du jour, bouton Nouvelle livraison),
    réglages de la courbe derrière `BoutonIcone` ;
  - courbe : 1 requête par table pour 12 mois, regroupement dans `dashboard.logic.ts` ;
    `getActionItems` (code mort) supprimé ; bouton « Nouvelle livraison » réellement visible.
- Lot 2 (plus tard) : solde Qonto + prévision 30 j (depuis Trésorerie), carte des
  chauffeurs du jour, indicateurs messagerie (taux d'échec, colis / tournée).

## 9. À tester après chaque PR
- Dernier / premier jour du mois : la course apparaît dans le bon mois.
- Compte chauffeur : ouvre l'app → Mes courses, jamais de montant.
- Bloc Aujourd'hui : chiffres = Livraisons filtrées sur aujourd'hui ; échec signalé visible.
- KPI : reste à facturer = Livraisons « livrées » ; à encaisser = « facturées ».
