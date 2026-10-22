# 06 — Finance (Trésorerie · Charges)

> Refonte du 22/10/2026 (lot F1). Fait foi pour la section. Reste : lot F2 (ventilation, Justificatifs, Pennylane).

## 1. Rôle
- Trésorerie : solde Qonto + relevé. Charges : dépenses de la société (Pennylane + saisies), catégories, justificatifs.

## 2. Fait (F1)
- Encaissement et Relances retirés (le suivi des factures se lit dans Livraisons › « À encaisser »).
- Trésorerie lecture seule : 4 tuiles (solde, autorisé, entrées / sorties du mois), recherche, Tous / Entrées / Sorties, mois par mois (mois courant ouvert).
- Charges : mois par mois (mois courant ouvert, un filtre ouvre tout), total HT du mois, tout en HT (colonne TTC et graphique « Dépenses par catégorie » retirés), 2 tuiles (Charges, Total HT).
- Briques partagées : `shared/lib/mois.ts` (+ test), `shared/ui/GroupeMois.tsx`.

- Charge « Passée en OD » (`charges.passee_en_od`, migration `20261022120000` appliquée) : un avoir saisi directement chez le comptable n'a pas de facture Pennylane → case dans la fiche charge, badge « OD » dans la liste, plus d'alerte « n'existe que dans le site » (`estChargeHorsPennylane`). Avoir E.LECLERC (retour mastic) marqué.

## 2b. Fait (F2a, 22/10/2026) — onglet Justificatifs
- Onglet **Justificatifs** (même droit que Charges) : À traiter · Validés · À rembourser · Refusés, recherche, mois par mois (hors « À traiter »). Remplace le panneau de tickets qui était dans Charges.
- Écran : la liste se LIT (tableau Date · Déclarant · Détail · Paiement · Montant · Statut, un seul état par ligne) ; on AGIT dans le tiroir d'un justificatif (photo, détails modifiables, suivi, barre d'actions en bas).
- Gestes (dans le tiroir) : Voir · Créer la charge (formulaire prérempli : date, libellé, moyen de paiement) · Valider (**refusé sans montant**) · Corriger (montant, date, catégorie, payé avec : anciens tickets sans montant, un par un) · Refuser (motif lu par le salarié).
- Notes de frais : « À rembourser » puis « Marquer remboursé » (`receipts_inbox.rembourse_le`, migration `20261022130000` appliquée) ; le salarié voit « Remboursée le … » dans Mes courses › Dépenses ; le total « à te rembourser » ne compte plus les remboursées. Statut « traité » renommé **Validé / Validée**.
- Charges : **moyen de paiement obligatoire** (plus de valeur par défaut « Qonto »).
- Cloche : « tickets à traiter » ouvre Justificatifs.

## 2c. Envoi vers Pennylane (22/10/2026)
- « Valider » envoie le justificatif dans la liste « à traiter » de Pennylane : Edge `pennylane-justificatif` (POST `/file_attachments` puis `/supplier_invoices/import` avec `file_attachment_id`), suivi sur le ticket (`receipts_inbox.pennylane_envoye_le` / `pennylane_id` / `pennylane_erreur`, migration `20261022140000` appliquée). Échec = le ticket reste validé, le tiroir affiche l'erreur + « Envoyer à Pennylane ».
- ⚠️ Contrat Pennylane non vérifié en vrai (doc injoignable depuis l'environnement) : si Pennylane refuse, l'erreur affichée dit quels champs manquent → ajuster l'Edge.
- « Créer la charge » ne l'envoie PAS (sinon doublon : la synchro ramènerait la facture Pennylane en charge). Une dépense envoyée à Pennylane revient comme charge par la synchro habituelle.

## 3. Reste (F2b → F4, décisions du 22/10/2026)
- Charges : plusieurs catégories par charge avec HT et TVA par ligne (aujourd'hui la ventilation existe en TTC, après enregistrement : `charge_allocations`), ventilation automatique par IA (le président valide), TVA repas 100 % déductible.
- Transfert vers Pennylane (cartes ET notes de frais) : à étudier en détail à la fin.

## 4. Fichiers
- `tresorerie/Tresorerie.tsx`, `tresorerie.logic.ts` (totaux, filtres), `charges/Charges.tsx`, `shared/lib/aRapprocher.ts` (charges seulement).

## 5. À tester
- Trésorerie : changer de filtre, chercher « total », ouvrir un mois ancien.
- Charges : mois ouverts / repliés, filtre de dates, export CSV, « Voir la liste » des charges hors Pennylane.
- Cloche : plus d'alerte « mouvements à rapprocher » ; l'alerte factures en retard ouvre Livraisons.
