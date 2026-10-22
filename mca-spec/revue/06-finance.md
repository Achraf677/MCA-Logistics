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

## 3. Reste (F2 → F4, décisions du 22/10/2026)
- Charges : plusieurs catégories par charge (HT par ligne, TVA par ligne), ventilation automatique par IA (le président valide), moyen de paiement obligatoire, TVA repas 100 % déductible.
- Onglet Justificatifs (même droit que Charges ; « Validé » distinct, « Remboursé » vu du salarié, validation sans montant refusée).
- Transfert vers Pennylane (cartes ET notes de frais) : à étudier en détail à la fin.

## 4. Fichiers
- `tresorerie/Tresorerie.tsx`, `tresorerie.logic.ts` (totaux, filtres), `charges/Charges.tsx`, `shared/lib/aRapprocher.ts` (charges seulement).

## 5. À tester
- Trésorerie : changer de filtre, chercher « total », ouvrir un mois ancien.
- Charges : mois ouverts / repliés, filtre de dates, export CSV, « Voir la liste » des charges hors Pennylane.
- Cloche : plus d'alerte « mouvements à rapprocher » ; l'alerte factures en retard ouvre Livraisons.
