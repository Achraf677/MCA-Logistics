# 03 — Livraisons › Livraisons

> Un fichier = un onglet (plan fixe, modèle `01-mes-courses.md`).
> Dernière mise à jour : 30/09/2026 (revue, avant lot 1).
> Section Livraisons = 4 sous-onglets : Livraisons (ce fichier), Devis, Modèles, Bons de
> livraison — revus à part.

## 1. Rôle
- Le registre des courses : saisir, suivre la machine à états, facturer (Pennylane),
  envoyer la facture, retrouver une course. Cœur historique du site.
- Doit servir l'express (course = retrait + livraison, heure limite) et la messagerie
  (nombreuses livraisons / colis, échecs, relivraisons).

## 2. Qui voit quoi
- Route `/livraisons` (onglet par défaut de la section), permission `livraisons.livraisons`.
- Créer : `livraisons.livraisons:create` ; RLS `deliveries_select_own` (chauffeur = ses
  courses, président / DG / comptable = tout).
- `?filtre=sans_justif` (cloche) ; `?ouvrir=<id>` (Dashboard) ouvre le tiroir.

## 3. L'écran, de haut en bas
- Barre du haut : « Nouveau », « Export » (CSV).
- 4 KPI : Ce mois (nb) · CA facturé (HT, TVA/TTC en dessous, TOUT l'historique) ·
  À facturer (nb livrées) · En attente de paiement (TTC).
- Bandeau « N livraisons en attente de synchronisation Pennylane » + Resynchroniser.
- Bandeau « sans justificatif » si filtre URL.
- Filtres : date début, date fin, statut, Réinitialiser.
- Barre de facturation groupée (cases cochées, un seul client) : Prévisualiser, Facturer.
- Tableau PC : case facturation · Date · N° facture · Client · Chauffeur · Montant HT
  (TTC dessous) · km · Statut (+ « Preuve ✓ ») · e-mail facture · « Voir ».
- Mobile : cartes (client, statut, date, chauffeur, type, n° facture, montant HT).
- Tiroir (1 833 lignes) : onglets Détail · Montant & Suivi · Documents · POD · Lettre de
  voiture. Détail = modèle, date, type, client, véhicule, chauffeur, description,
  adresses retrait / livraison, km en charge (calcul IGN), km à vide, notes.

## 4. Gestes et écritures
- Créer / modifier / supprimer une course (tiroir), transitions via `canTransition`
  (→ facturee : Edge `pennylane-invoice`, échec → `sync_pending`).
- Facturation groupée (Edge `pennylane-invoice` avec `delivery_ids`).
- Envoi e-mail facture (+ BL) au client (Edge).
- Resync Pennylane ; export CSV.

## 5. Données lues
- TOUTES les livraisons de l'historique (`*` + client, véhicule, chauffeur), sans limite
  de période par défaut.
- TOUS les documents de type livraison, à chaque ouverture (servent seulement au filtre
  « sans justificatif »).
- Livraisons `sync_pending`.

## 6. Fichiers
- `src/features/livraisons/` : `Livraisons.tsx` (623 l.), `DrawerLivraison.tsx` (1 833 l.),
  `LettreVoitureTab.tsx`, `ApercuFacture.tsx`, `BonsLivraison.tsx`, `DerniersNumeros.tsx`,
  `livraisons.logic.ts` (+ tests), `livraisons.queries.ts`, `livraisons.types.ts`,
  `lettreVoiture.*`, `apercuFacture.logic.ts`, `emailClient.logic.ts`.
- `src/app/sections/LivraisonsSection.tsx`.

## 7. Critique (30/09/2026)
Bon
- Machine à états respectée, facturation Pennylane groupée par client avec aperçu.
- Montant HT en principal, TTC en dessous ; envoi facture + BL en un clic.
- Tableau PC / cartes mobile, tiroir chargé à la demande.
- Bandeaux utiles (resync Pennylane, sans justificatif).

Pas bon — bugs
- « Ce mois » : même bug de date que le Dashboard (le mois commence la veille du 1er en
  heure de Paris) et SANS borne de fin : les courses planifiées le mois prochain comptent.
- La recherche de la barre du haut (« Rechercher une livraison, un client… ») envoie vers
  `/livraisons?q=…`, que l'écran IGNORE : la recherche ne fait rien.
- Aucune saisie de l'HEURE prévue / limite (`arrival_time`) nulle part : Mes courses
  l'affiche (« Prévu à 14 h 30 », retard en rouge) mais le bureau ne peut pas la remplir.
- Les échecs signalés par les chauffeurs (lot Mes courses) sont invisibles ici : ni badge,
  ni filtre, ni geste pour les traiter ; la cloche pointe vers la liste sans filtre.

Pas bon — usage
- Tout l'historique chargé à chaque ouverture (et tous les documents) : lent à mesure que
  les courses s'accumulent.
- Pas de filtre client / chauffeur (la requête les gère, l'écran ne les propose pas), pas de
  raccourcis de période (aujourd'hui, semaine, mois).
- Le tableau ne montre ni le TRAJET (retrait → livraison) ni l'heure : pour de l'express,
  c'est l'info n° 1.
- Contacts expéditeur / destinataire et nb de colis cachés dans l'onglet Lettre de voiture
  (et seulement après création).
- KPI : « CA facturé » porte sur tout l'historique (sans le dire), style différent du
  Dashboard.
- « Voir » en double du clic sur la ligne ; « Preuve ✓ » et « ✓ » en caractères (pas de
  pictogramme) ; modale de confirmation maison au lieu du composant commun.

## 8. Lots
- Lot 1 (proposé) :
  - bugs : « Ce mois » (heure locale, borne de fin) ; recherche `?q=` branchée (client,
    adresses, description, n° facture) ; saisie de l'heure prévue dans Détail ;
  - échecs : badge « Échec · Absent » sur la ligne, filtre « Échecs », lien de la cloche
    vers ce filtre ; dans le tiroir, bandeau du problème + « Replanifier » (nouvelle date,
    problème levé) / « Problème réglé » ;
  - période par défaut = ce mois, raccourcis Aujourd'hui · Semaine · Mois · Tout ; filtres
    client et chauffeur ; documents chargés seulement pour le filtre « sans justificatif » ;
  - tableau : colonne Trajet (retrait → livraison, tronqué) et Heure ; « Voir » retiré ;
    pictogrammes à la place des « ✓ » ;
  - Détail : contacts expéditeur / destinataire (tél.) et nb de colis dès la création ;
  - KPI au format des cartes du Dashboard, sur la période affichée.
- Lot 2 (messagerie) : colis multiples par livraison (liste de colis, statut par colis),
  import d'une tournée (CSV), vue par jour / tournée, relivraison chaînée à la course
  d'origine, retour dépôt.

## 9. À tester après chaque PR
- Course du 1er et du dernier jour du mois → comptée dans « Ce mois » ; course du mois
  prochain → non.
- Recherche en haut « nom client » → liste filtrée.
- Heure saisie au bureau → visible dans Mes courses (« Prévu à … »).
- Échec signalé depuis Mes courses → badge + filtre ici → Replanifier → alerte éteinte.
- Facturation groupée et e-mail facture inchangés.
