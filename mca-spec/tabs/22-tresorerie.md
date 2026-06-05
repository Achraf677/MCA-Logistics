# Onglet — TRÉSORERIE

_Onglet Finance en **lecture seule** côté front : affiche le dernier solde de trésorerie (snapshot Qonto) et les transactions bancaires. Deux actions déclenchent des Edge Functions (sync Qonto, vérification des paiements). Aucun appel API externe depuis le navigateur — colonnes additives, réversible._

## ① Rôle
Donner une vue temps réel de la trésorerie : solde du compte Qonto et flux bancaires.
Permet de déclencher manuellement la synchronisation Qonto et le rapprochement des paiements
Pennylane (livraisons `facturee` → `payee`).

## ② Parti pris
- Module autonome `features/tresorerie/`. Aucun import entre features.
- **Lecture seule** : le front lit `treasury_snapshots` et `qonto_transactions` (peuplées par l'Edge Function `qonto-sync`).
- **Aucun appel API externe direct** : Qonto et Pennylane sont joints uniquement via Edge Functions.
- Les deux boutons invoquent `qonto-sync` et `pennylane-payment-check`, puis rechargent la vue.
- Montants en **centimes** (`*_cts`), formatés via `shared/lib/money.ts`.

## ③ Données — tables `treasury_snapshots` & `qonto_transactions`
**`treasury_snapshots`** (1 ligne par compte par run, écrite par `qonto-sync`) :
`id` · `company_id` · `balance_cts` · `authorized_balance_cts` · `iban` · `source` · `fetched_at`.

**`qonto_transactions`** (upsert idempotent sur `qonto_id`) :
`id` · `company_id` · `qonto_id` · `label` · `amount_cts` · `side` (credit|debit) ·
`operation_type` · `settled_at` · `raw_data`.

## ④ Sources live (API)
Aucune côté front. Données peuplées par l'Edge Function **`qonto-sync`** (lecture seule Qonto).
Rapprochement des paiements par **`pennylane-payment-check`**.

## ⑤ Vue & composants
- **KPIs** : Solde actuel · Solde autorisé · Dernière synchro (`fetched_at` du dernier snapshot) · Nb transactions.
- **Liste des transactions** : date (`settled_at`), libellé (`label`), montant signé coloré
  (credit → `+` vert, debit → `−` rouge), Badge type d'opération (`operation_type`).
- **États** : `loading` → Skeleton ; vide → EmptyState « Aucune donnée — clique sur Synchroniser Qonto ».

## ⑥ Actions
| Action | Effet |
|---|---|
| Synchroniser Qonto | invoke `qonto-sync` → recharge → toast « Solde mis à jour » |
| Vérifier les paiements | invoke `pennylane-payment-check` → recharge → toast « X livraison(s) marquée(s) payée(s) » |

Pendant un appel, les deux boutons sont désactivés (état `pending`).

## ⑦ Logique métier (`tresorerie.logic.ts`)
Fonctions **pures** :
- `formatSignedAmount(tx)` : montant signé depuis `amount_cts` + `side` (credit → `+`, debit → `−`).
- `amountColor(side)` : couleur (`credit` → success, `debit` → danger).
- `OPERATION_TYPE_LABELS` : libellés FR des `operation_type` Qonto.
- `formatSnapshotDate(iso)` : formatage de `fetched_at`.

## ⑧ États & cas limites
- Aucun snapshot → KPIs à `—`, EmptyState invitant à synchroniser.
- `settled_at` null → trié en dernier (nulls last), date affichée `—`.
- Échec d'une Edge Function → toast d'erreur, boutons réactivés.
- `operation_type` inconnu → libellé brut affiché.

## ⑨ Dépendances
- **Consomme** : `treasury_snapshots`, `qonto_transactions` (peuplées par `qonto-sync`).
- **Déclenche** : Edge Functions `qonto-sync`, `pennylane-payment-check`.
- **Partagé** : `shared/lib/money.ts`, `shared/ui/` (KpiCard, Button, Badge, EmptyState, Skeleton, useToast).
