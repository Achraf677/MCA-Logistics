# Intégration QONTO — Ingestion trésorerie (lecture seule)

> Spec d'intégration. Première brique Qonto : **ingérer** le solde et les
> transactions du compte pro dans Supabase. **Aucune** écriture sur les données
> métier. Le rapprochement bancaire est une étape **ultérieure et distincte**.

## ① Objectif
Faire entrer dans Supabase, à la demande (Edge Function `qonto-sync`) :
- le **solde** de chaque compte bancaire Qonto (snapshot horodaté) ;
- les **transactions** du compte (historique, idempotent).

Contrainte non négociable : **on ne modifie jamais `deliveries` ni `payments`**.
L'ingestion est en lecture seule côté métier ; elle ne fait qu'alimenter deux
tables de réception. Le rapprochement (associer une transaction à un paiement /
une livraison) sera une étape séparée, avec sa propre Edge Function.

## ② API Qonto
- Base : `https://thirdparty.qonto.com/v2`
- Auth : header `Authorization: <QONTO_SLUG>:<QONTO_SECRET_KEY>` (pas de `Bearer`).
- Secrets `QONTO_SLUG` / `QONTO_SECRET_KEY` : dans l'env de l'Edge Function
  (`Deno.env`) **uniquement**. Jamais loggués, jamais renvoyés au client.

### Endpoints utilisés
| Endpoint | Usage | Champs lus |
|---|---|---|
| `GET /organization` | comptes bancaires + soldes | `bank_accounts[].{ id, iban, balance_cents, authorized_balance_cents }` |
| `GET /transactions?bank_account_id={id}&per_page=100` | historique paginé | `id, amount_cents, side, operation_type, label, settled_at, status, reference` |

Pagination des transactions : `current_page` croissant jusqu'à `meta.total_pages`.

## ③ Écritures Supabase
Mono-société : `company_id = (select id from companies limit 1)`.

### `treasury_snapshots` — 1 ligne par compte par run
| Colonne | Source | Type |
|---|---|---|
| `company_id` | première company | uuid |
| `balance_cts` | `balance_cents` | int (centimes) |
| `authorized_balance_cts` | `authorized_balance_cents` | int (centimes) |
| `iban` | `iban` | text |
| `source` | constante `'qonto'` | text |

### `qonto_transactions` — upsert idempotent
Clé d'unicité : **`qonto_id`** (contrainte unique). Upsert `onConflict: 'qonto_id'`,
`ignoreDuplicates: true` → un même run rejoué n'écrit pas de doublon.
| Colonne | Source | Type |
|---|---|---|
| `company_id` | première company | uuid |
| `qonto_id` | `id` (transaction Qonto) | text, **unique** |
| `label` | `label` | text |
| `amount_cts` | `amount_cents` | int (centimes) |
| `side` | `side` (`debit` / `credit`) | text |
| `operation_type` | `operation_type` | text |
| `settled_at` | `settled_at` | timestamptz |
| `raw_data` | transaction entière | jsonb |

**`payment_id` n'est PAS écrit ici** : le lien transaction → paiement appartient
à l'étape de rapprochement (ultérieure).

> ⚠️ Pré-requis (étape distincte, hors de cette brique) : migration créant
> `treasury_snapshots` et `qonto_transactions` (UP + DOWN, contrainte unique sur
> `qonto_transactions.qonto_id`). Sans elle, `qonto-sync` déploie mais échoue à
> l'invocation réelle.

## ④ Edge Function `qonto-sync`
- `verify_jwt: true` (défaut) — seul un appel authentifié du site la déclenche.
- 500 si un secret manque ; 404 si aucune company.
- Erreur API/réseau Qonto → `ExternalApiError` → réponse `502` avec
  `{ status, body }` brut (mêmes conventions que `pennylane-invoice`).
- Réponse succès : `{ ok: true, data: { snapshots, transactions_upserted, balance_cts } }`.

## ⑤ Hors périmètre (étapes suivantes)
- **Rapprochement** transaction ↔ paiement / livraison (Edge Function dédiée).
- Déclenchement planifié (cron) — pour l'instant invocation manuelle/à la demande.
- Webhooks Qonto.
