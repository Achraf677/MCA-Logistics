# Revue 01 — Mes courses (30/09/2026)

Écran chauffeur : `src/features/mescourses/`. Cible : téléphone tenu d'une main.

## Ce qui est bon
- Une carte par ARRÊT (retrait / livraison) et non par course : on peut charger A, charger B,
  livrer A. Ordre modifiable (flèches), enregistré.
- Bon numéro au bon moment : expéditeur au retrait, destinataire à la livraison, repli sur le
  client avec avertissement.
- SMS types, choix de l'appli GPS (Waze / Maps…) mémorisé sur le téléphone.
- Parcours de preuve pas à pas : photos (envoyées tout de suite, compressées), nom, signature,
  signature transporteur, récap. Tout est « Passer » possible.
- Plan de chargement (dernier livré = chargé en premier) + poids total.
- Pièces jointes du bureau consultables, aucun montant affiché.

## Ce qui n'est pas bon
- Mobile : 4 blocs avant le premier arrêt (Jour/Semaine/Mois, flèches, appli GPS, scanner de
  ticket). Le chauffeur défile avant de voir où aller.
- « Mois » inutile pour un chauffeur ; le choix d'appli GPS se règle une fois, pas tous les jours.
- Pas de « prochain arrêt » mis en avant : sur 30 arrêts, le chauffeur cherche le bon.
- Seul geste de fin : « Livrer ». Aucun échec possible (absent, refus, adresse introuvable,
  accès impossible) → le chauffeur ment ou laisse en cours.
- Infos saisies au bureau invisibles : notes / consignes (codes, étage), heure prévue
  (`arrival_time`), nombre de colis (`nb_colis`).
- Aucune urgence express visible (heure limite, retard).
- PC : même écran étiré ; un président y voit les courses de TOUS les chauffeurs mélangées,
  sans nom de chauffeur.
- « Terminer » dans le parcours de preuve est ambigu à côté d'« Annuler ».

## À ajouter
- Lot 1 (cette PR) : en-tête compact (Jour / Semaine + réglages repliés), bouton flottant
  « Ticket », carte « Prochain arrêt » + progression, consignes / heure / colis sur la carte,
  bouton « Problème » avec motif (échec de livraison), filtre « mes courses » + nom du
  chauffeur pour président / DG sur PC.
- Lot 2 (messagerie) : colis multiples avec comptage / scan, mode hors-ligne (file d'envoi),
  relivraison et retour dépôt, prise de poste (véhicule + km départ / fin).

## Lot 1 — livré (PR feat/revue-mes-courses)
- En-tête sur une ligne : ‹ jour › + Jour/Sem. + réglages (appli GPS) ; « Mois » retiré.
- Carte « Prochain arrêt » + progression (faits / total), l'arrêt ciblé est encadré.
- Heure prévue (retard en rouge, < 1 h en orange), nombre de colis, consignes du bureau.
- Bouton « Problème » : motif + note + photo facultative → `deliveries.probleme_*`
  (migration 20260930090000), statut inchangé ; alerte rouge dans la cloche ;
  « Livrer » ensuite lève l'alerte (relivraison).
- Bouton flottant « Ticket ». « Terminer » → « Livrer / Charger sans preuve ».
- Président / DG avec fiche équipe : bascule Mes courses / Tous les chauffeurs,
  nom du chauffeur sur chaque carte en vue « Tous ».
