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
- ÉCRAN DE CONSULTATION : aucune modification depuis le Dashboard. Chaque chiffre /
  ligne mène à l'onglet où l'on agit.
- Tient sur UN écran PC (1080p) ; une colonne sur mobile.
- Ligne 1 : « Bonjour <prénom> · date du jour » (plus de bouton Nouvelle livraison).
- Ligne 2 — 4 cartes au même gabarit (en-tête pictogramme + libellé identique) :
  - « Aujourd'hui » : 5 cases bordées (À faire · En cours · Livrées · Retard · Échecs),
    rouges si > 0, → Livraisons ; lien « Planning » → Calendrier ;
  - CA HT du mois (évolution vs mois dernier) → affiche les livraisons du mois à droite ;
  - Reste à facturer (livrées non facturées, HT) → Livraisons ;
  - À encaisser (facturées, TTC, « dont X en retard ») → Encaissement.
- Ligne 3 :
  - barres mensuelles du CA (`BarresMensuelles`, cliquables) : un clic sur un mois
    affiche ses livraisons dans la carte de droite (re-clic ou × = retour) ;
    période derrière le `BoutonIcone` Réglages ;
  - carte de droite : « Activité récente » (6 dernières modifiées) OU « <mois> »
    (toutes ses livraisons, total HT, défilante). Un clic sur une ligne ouvre la
    livraison dans Livraisons (`/livraisons?ouvrir=<id>`).

## 4. Gestes et écritures
- Aucune écriture. Navigation uniquement ; `/livraisons?ouvrir=<id>` ouvre le tiroir
  de la livraison dans l'onglet Livraisons (paramètre retiré après ouverture).

## 5. Données lues (une vague parallèle de 5 requêtes + 1 au clic sur un mois)
- `deliveries` des 12 derniers mois (date, statut, amount_ht_cts) → barres et CA,
  découpés en mémoire.
- `deliveries` du jour + ouvertes des jours passés (date, statut, arrival_time, probleme_le).
- `deliveries` livrées (amount_ht_cts) ; facturées (invoiced_at, amount_ttc_cts,
  `clients.payment_terms`, 30 j par défaut).
- 6 dernières modifiées (id, date, statut, montant, client, chauffeur).
- Au clic sur un mois : ses livraisons (mêmes colonnes), hors annulées.

## 6. Fichiers
- `src/features/dashboard/Dashboard.tsx`, `dashboard.queries.ts`, `dashboard.logic.ts`
  (+ tests : bornes de mois en heure locale, agrégation, journée, encaissement).
- `src/app/sections/PilotageSection.tsx` (renvoi chauffeur).
- Dette baselinée : importe `livraisons` (libellés de statut) — plus le tiroir.
- `livraisons` : `getDelivery(id)` + ouverture `?ouvrir=`.
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
- Lot 1 bis — FAIT : barres cliquables → livraisons du mois ; bandeau harmonisé ;
  bouton Nouvelle livraison et tiroir retirés (consultation seule).
- Lot 2 — plan « cartographier + interactif au maximum » (proposé, à valider) :
  - Survol partout : infobulle sur chaque barre (CA, nb livraisons, % facturé) et
    chaque case (liste des courses concernées au survol / au clic).
  - Cases « Aujourd'hui » cliquables en place : la carte de droite liste les courses
    à faire / en cours / en retard / en échec (comme pour un mois), sans quitter.
  - « À encaisser » en place : factures ouvertes triées par retard, client, jours de
    retard ; « Reste à facturer » : livrées à facturer groupées par client.
  - Graphique à onglets (même carte) : CA · nb livraisons · par client (top 5 en
    barres horizontales, clic = ses livraisons) · par chauffeur.
  - Comparaison N-1 : barre fantôme de l'an dernier derrière chaque mois.
  - Carte « Qui roule aujourd'hui » : chauffeurs du jour, arrêts faits / total,
    dernier arrêt, problème signalé (lecture de Mes courses).
  - Carte trésorerie (lecture Qonto) : solde, entrées / sorties du mois.
  - Filtre global en en-tête (BoutonIcone) : chauffeur / client / véhicule appliqué à
    tout l'écran.
  - Tout reste en lecture : chaque ligne ouvre l'onglet métier (`?ouvrir=`).
- Transversal (hors Dashboard, à décider) : `text-[var(--fs-xs|sm|h2|h3)]` (~700
  usages) est compilé par Tailwind v4 en `color:` et non en taille → les tailles
  prévues ne s'appliquent nulle part. Correctif global = `text-[length:var(...)]`,
  change l'aspect de tous les onglets : à faire en une PR dédiée, avec validation.

## 9. À tester après chaque PR
- Dernier / premier jour du mois : la course apparaît dans le bon mois.
- Compte chauffeur : ouvre l'app → Mes courses, jamais de montant.
- Bloc Aujourd'hui : chiffres = Livraisons filtrées sur aujourd'hui ; échec signalé visible.
- KPI : reste à facturer = Livraisons « livrées » ; à encaisser = « facturées ».
