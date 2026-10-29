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

## 2a-bis. À traiter en sous-sections (29/10/2026)
- « À traiter » : Notes de frais (par salarié) · CB classique · CB carburant (· À préciser pour les anciens). Filtres : famille (pastilles + compteurs), déclarant, carte, mois, « À compléter », Réinitialiser ; valables sur tous les onglets.

## 2a. Carte carburant (29/10/2026)
- Justificatifs › vue « Carburant » : tickets payés à la carte carburant (Edenred), par mois (flèches), total / pleins / moyenne, par véhicule (barres), jour par jour (clic = tiroir), export CSV. Informatif : jamais envoyé à Pennylane.
- « Ajouter un plein » : saisie à la main sans justificatif (date, véhicule, litres, prix au litre → TTC calculé, qui a fait le plein, carte bancaire, note ; tout obligatoire), modifiable / supprimable ; table `pleins_carburant`.
- Salarié : véhicule obligatoire (`receipts_inbox.vehicle_id`) ; absents de la liste « À traiter ».

## 2b. Fait (F2a, 22/10/2026) — onglet Justificatifs
- Onglet **Justificatifs** (même droit que Charges) : À traiter · Validés · À rembourser · Refusés, recherche, mois par mois (hors « À traiter »). Remplace le panneau de tickets qui était dans Charges.
- Écran : la liste se LIT (tableau Date · Déclarant · Détail · Paiement · Montant · Statut, un seul état par ligne) ; on AGIT dans le tiroir d'un justificatif (photo, détails modifiables, suivi, barre d'actions en bas).
- Gestes (dans le tiroir) : Voir · Créer la charge (formulaire prérempli : date, libellé, moyen de paiement) · Valider (**refusé sans montant**) · Corriger (montant, date, catégorie, payé avec : anciens tickets sans montant, un par un) · Refuser (motif lu par le salarié).
- Notes de frais : « À rembourser » puis « Marquer remboursé » (`receipts_inbox.rembourse_le`, migration `20261022130000` appliquée) ; le salarié voit « Remboursée le … » dans Mes courses › Dépenses ; le total « à te rembourser » ne compte plus les remboursées. Statut « traité » renommé **Validé / Validée**.
- Charges : **moyen de paiement obligatoire** (plus de valeur par défaut « Qonto »).
- Cloche : « tickets à traiter » ouvre Justificatifs.

## 2c. Envoi vers Pennylane (22/10/2026)
- « Valider » envoie le justificatif PAR MAIL à l'adresse de dépôt Pennylane (`companies.pennylane_depot_email`, Paramètres Pennylane › Transmission des factures) avec le fichier en pièce jointe : il arrive dans « À traiter » de la compta, Pennylane lit montant / TVA / fournisseur. Edge `pennylane-justificatif` (v12 : photo JPEG convertie en PDF avant envoi, `_shared/jpegPdf.ts`, car Pennylane ignore une JPEG jointe) via Gmail du compte Google connecté (`_shared/gmail.ts`, scope gmail.send seul ; connexion « Envoi d’e-mails (Gmail) » dans Paramètres, Drive retiré le 23/10/2026 (60 anciens justificatifs restent lisibles par leur ancien lien, non rapatriés)). L'API d'import fournisseur (`/supplier_invoices/import`) rangeait la facture côté gestion seulement : abandonnée le 23/10/2026.
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
- Justificatif ouvert : « Remettre à traiter » (validé ou refusé, repart de zéro) et « Supprimer » (confirmation ; droit finance.charges delete) dans le tiroir.
- **Lecture IA du ticket (23/10/2026)** : à l'ouverture d'un justificatif « à traiter » jamais lu, Edge `lire-ticket` (vision Mistral, gratuit) lit le ticket et remplit SEULEMENT les cases vides : montant TTC, date, catégorie, TVA (un seul taux), fournisseur (si un seul fournisseur du site correspond). Rien de saisi par le salarié n'est écrasé ; champ douteux (confiance < 0,7) ou invraisemblable (> 5 000 €, date future) = vide. Résultat gardé dans `receipts_inbox.ocr_lecture` / `ocr_lu_le` (migration `20261023110000`) ; bandeau « Prérempli d'après le ticket » + alerte si le montant lu diffère du montant saisi. Règles pures : `_shared/lectureTicket.ts`.
- **Refonte visuelle Justificatifs (23/10/2026)** : 4 tuiles cliquables (À traiter · À rembourser en € · Validés · Refusés, `ChiffreCarte`) à la place des boutons de filtre ; lignes avec miniature du ticket (liens signés par lot, `receiptsInbox.queries#urlsTickets`) et pastille du déclarant ; tiroir large en 2 colonnes (ticket grand et collé à gauche, PDF en iframe ; montant en gros, bandeau de lecture IA, bloc Dépense, frise de suivi Envoyé → Validé → Pennylane → Remboursé, `justificatifs.logic#etapesSuivi`) ; gestes en bas : valider (principal), créer la charge, puis Refuser / Remettre à traiter / Supprimer en pictogrammes. Tiroir dans `FicheJustificatif.tsx`.
- **Lecture IA (23/10/2026, v2)** : lancée dès le dépôt du ticket par le salarié (`deposerTicket` → Edge `lire-ticket`, le déposant est autorisé), une seule fois par ticket ; rattrapage silencieux (8 max, sans recharger l'écran) pour les tickets déposés avant ; plus de lecture à l'ouverture du tiroir. TVA retirée du tiroir et de la lecture (la colonne `tva_rate` reste en base, plus écrite). Pastille `Badge` corrigée (taille fixe, jamais sur 2 lignes).
- **Tiroir (24/10/2026)** : tout est obligatoire pour valider (montant, date, catégorie, payé avec, fournisseur : `depenses#manquesValidation`) ; plus de fournisseur par défaut ; « Valider » enregistre ce qui est à l'écran puis valide et envoie ; bandeau « Il manque pour valider : … ». Listes déroulantes = `shared/ui/ListeDeroulante` (menu dans le body, recherche dès 7 choix, clavier) à la place des `<select>` natifs de ce tiroir ; `Champ requis` affiche l'astérisque.
- **Montants = Pennylane (24/10/2026)** : « Créer la charge » retiré des Justificatifs ; la charge se crée chez Pennylane et revient par la synchro (Edge `pennylane-sync` v23). Lot 2b (HT / TVA par ligne) abandonné.
- **Facture supprimée chez Pennylane (24/10/2026)** : la synchro SUPPRIME la charge locale (et ses pièces jointes, ses lignes `fuel_logs` / `vehicle_maintenances` reliées ; `qonto_transactions` et `receipts_inbox` sont seulement détachés). Garde-fou `_shared/suppressionPennylane#decisionSuppression` : liste Pennylane vide, ou > 10 charges et > moitié d'un coup = rien n'est effacé, on signale (`pennylane_deleted_at`, ancienne alerte).
