# MIGRATION v2 — DELTAS (tarif · échéances · validités · montants livraison)

**But** : ajouter les colonnes nécessaires aux specs v2 des onglets, **sans rien casser**.
**Principe** : 100 % additif, colonnes **nullables**, `IF NOT EXISTS`. Réversible par le down.
**Cible** : projet Supabase v2 `pzfgtcugmqeqixogwzcu` (phase 1bis).
**Pré-requis** : les tables de base (`clients`, `suppliers`, `vehicles`, `team_members`, `deliveries`)
doivent déjà exister (migrations `04-DATA-MODEL`). Si `deliveries` n'existe pas encore,
applique d'abord la migration de base, puis ce delta.

> Aucun changement RLS : les nouvelles colonnes héritent des politiques de leur table.
> Aucune donnée existante modifiée. `suppliers` n'a aucun delta (le dédoublonnage est de la logique pure).

---

## UP — `supabase/migrations/20260603120000_v2_deltas.sql`

```sql
-- ── CLIENTS : tarif (source du montant auto des livraisons) ──────────────────
alter table public.clients
  add column if not exists tariff_mode text not null default 'manuel',
  add column if not exists tariff_rate_cts bigint;

-- borne les valeurs autorisées (droppable au down)
alter table public.clients
  drop constraint if exists clients_tariff_mode_chk;
alter table public.clients
  add constraint clients_tariff_mode_chk
  check (tariff_mode in ('forfait','km','palette','manuel'));

-- ── VEHICLES : échéances réglementaires ──────────────────────────────────────
alter table public.vehicles
  add column if not exists ct_expiry date,
  add column if not exists insurance_expiry date,
  add column if not exists next_revision_date date;

-- ── TEAM_MEMBERS : validités chauffeur ───────────────────────────────────────
alter table public.team_members
  add column if not exists licence_b_expiry date,
  add column if not exists medical_visit_expiry date;

-- ── DELIVERIES : montants + jalons facturation/paiement ──────────────────────
alter table public.deliveries
  add column if not exists amount_ht_cts bigint,
  add column if not exists tva_cts bigint,
  add column if not exists amount_ttc_cts bigint,
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz;
```

### Cas du statut des livraisons
Les statuts v2 sont : `planifiee · en_cours · livree · facturee · payee · annulee`.

- **Si `deliveries.status` est une colonne `text`** → rien à faire ici (la machine à états
  est garantie côté `livraisons.logic.ts` via `canTransition`). *Recommandé.*
- **Si `status` est un type `enum` Postgres** → ajoute les valeurs manquantes (irréversible, à éviter) :

```sql
-- À n'exécuter QUE si status est un enum existant (sinon ignorer ce bloc)
-- alter type delivery_status add value if not exists 'facturee';
-- alter type delivery_status add value if not exists 'payee';
-- alter type delivery_status add value if not exists 'annulee';
```

---

## DOWN — `supabase/migrations/20260603120000_v2_deltas.down.sql`

```sql
alter table public.deliveries
  drop column if exists amount_ht_cts,
  drop column if exists tva_cts,
  drop column if exists amount_ttc_cts,
  drop column if exists invoiced_at,
  drop column if exists paid_at;

alter table public.team_members
  drop column if exists licence_b_expiry,
  drop column if exists medical_visit_expiry;

alter table public.vehicles
  drop column if exists ct_expiry,
  drop column if exists insurance_expiry,
  drop column if exists next_revision_date;

alter table public.clients
  drop constraint if exists clients_tariff_mode_chk,
  drop column if exists tariff_mode,
  drop column if exists tariff_rate_cts;
```
*(Le down sur un enum n'est pas fourni : ne pas partir sur un enum pour `status`.)*

---

## Vérification post-migration (à faire lancer par Claude Code)
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('clients','vehicles','team_members','deliveries')
  and column_name in (
    'tariff_mode','tariff_rate_cts',
    'ct_expiry','insurance_expiry','next_revision_date',
    'licence_b_expiry','medical_visit_expiry',
    'amount_ht_cts','tva_cts','amount_ttc_cts','invoiced_at','paid_at'
  )
order by table_name, column_name;
```
Doit retourner 12 lignes, toutes `is_nullable = YES` sauf `tariff_mode` (NOT NULL, défaut `'manuel'`).
