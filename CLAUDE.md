# CLAUDE.md — Mémoire permanente du projet MCA

> Claude Code lit ce fichier au démarrage de CHAQUE session. Il fait foi.

## Identité & vocabulaire
- Projet : **site de gestion interne MCA Logistics** (PGI/TMS maison). Transport routier sub-3,5 t.
- ✘ Ne jamais écrire « DelivPro » (abandonné), ni « v1 / v2 ». **Une seule version : celle-ci.**
- L'ancien essai abandonné = « ancien essai » / « résidus en base ». Pas « v1 ».

## Stack
React + TypeScript + Tailwind v4 (`@tailwindcss/vite`) · Vite · Supabase (Postgres + RLS + Auth + Storage + Edge Functions). Dev local : `http://localhost:5173`. Repo : branche `main` = source de vérité.

## Supabase
- Project ID : `pzfgtcugmqeqixogwzcu` · Région eu-west-3.
- Front : **anon key uniquement** via `import.meta.env` (client dans `src/app/providers.tsx`).
- **Service role : JAMAIS côté front.** Uniquement dans les Edge Functions (`Deno.env`).
- Ancien projet abandonné `lkbfvgnhwgbapdtitglu` : ne plus utiliser.

## Architecture (règle d'or — non négociable)
```
src/
├── app/        Shell.tsx, routes.tsx, providers.tsx (client Supabase)
├── shared/     ui/, actions/, lib/ (echeances.ts, money.ts, download.ts)
├── features/   1 dossier étanche par onglet :
│   └── <x>/    <X>.tsx, <x>.queries.ts, <x>.types.ts, <x>.logic.ts, Drawer<X>.tsx
└── integrations/  pennylane.ts, qonto.ts, drive.ts (clients d'API côté Edge Function)
```
- **Aucun import entre `features/`.** Couplage interdit.
- **Tout appel API externe via Edge Function Supabase.** Jamais depuis le navigateur.
- Calculs métier dans `*.logic.ts` UNIQUEMENT (fonctions pures, sans DB ni DOM).
- Accès DB dans `*.queries.ts` uniquement. UI depuis `shared/ui/` uniquement.
- Chaque drawer vit dans SA feature. Réparabilité : supprimer un onglet = supprimer `features/<x>/` + 1 ligne dans `routes.tsx`.
- Montants toujours en **centimes** (`*_cts`), formatés via `shared/lib/money.ts`.
- Échéances/validités via `shared/lib/echeances.ts` (date absente → statut `none`).

## État actuel (codé & testé)
Référentiels : Clients (tarif + encours), Fournisseurs (anti-doublon SIREN), Véhicules (échéancier), Équipe (validités). Cœur : Livraisons (machine à états + montant auto + TVA éditable).
Non commencés : Flotte, Opérations, Finance, **Intégrations**, Pilotage, Système.

## Règles base de données — résidus de l'ancien essai (NE PAS réintroduire les bugs)
- `deliveries.montant_*` sont des colonnes **GENERATED** ou legacy → **ne jamais écrire dedans**. Écrire UNIQUEMENT `amount_ht_cts`, `tva_cts`, `amount_ttc_cts`. Lecture en fallback `amount_* ?? montant_*`.
- `deliveries.statut` est un `text` contraint par `deliveries_statut_check` =
  `planifiee, en_cours, livree, facturee, payee, annulee`. Toute nouvelle valeur exige une migration de la contrainte.
- Migrations : toujours UP **et** DOWN, versionnées dans `supabase/migrations/`. Colonnes ajoutées = nullables/additives.

## Machine à états Livraisons (source : livraisons.logic.ts)
`planifiee→{en_cours,annulee}` · `en_cours→{livree,annulee}` · `livree→{facturee}` · `facturee→{payee}` · `payee→{}` · `annulee→{}`. Toute transition passe par `canTransition`.
À la transition `→facturee` : le front invoke l'Edge Function **`pennylane-invoice`** `{ delivery_id }` ; si échec → `deliveries.sync_pending = true`.

## Pilotage Claude Code
- Une étape = une seule chose. Lire UNIQUEMENT les fichiers de l'étape. S'arrêter au critère d'arrêt.
- Branche par étape (`feat/…` ou `fix/…`). Fin d'étape = commit **+ push -u origin + merge dans main + push main**. Confirmer les hash. Sans push, rien n'est sauvegardé ni vérifiable.
- Ne jamais inventer une info manquante : demander.
- Specs des onglets : `mca-spec/tabs/` (format 9 sections — ★☆). Specs intégrations : `mca-spec/integrations/`.
