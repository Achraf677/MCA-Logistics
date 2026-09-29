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
Le site est en production avec **8 sections** (menu principal, `src/app/sections/`), chacune à
sous-onglets : **Pilotage** (Dashboard, Rentabilité, Statistiques) · **Livraisons** (Livraisons,
Bons de livraison, Calendrier) · **Finance** (Trésorerie, Charges, Encaissement, TVA, Relances) ·
**Flotte** (Véhicules, Carburant, Entretiens, Inspections, Incidents) · **Planning** ·
**Tiers** (Clients, Fournisseurs, Devis) · **Équipe** (Équipe, Heures) · **Système** (Paramètres,
Admins, Modèles). Plus deux écrans hors menu : **Mes courses** (parcours chauffeur, mobile) et la
cloche **Alertes**. Soit **30 dossiers `features/`** au total — bien au-delà des specs `mca-spec/tabs/`,
qui n'en couvrent qu'une partie : ne pas s'y fier seule pour savoir ce qui existe déjà, vérifier
`src/features/` et `src/app/sections/`.
Cœur historique : Livraisons (machine à états + montant auto + TVA éditable, y compris
autoliquidation intracommunautaire).

## En cours — 29/09/2026 (à lire avant de reprendre)
- **OCR Carburant/Entretiens : tout le code est prêt, mais BLOQUÉ côté Mistral.**
  Le compte Mistral (`chikriachraf67@gmail.com`, workspace "Default Workspace") est en forfait
  gratuit **sans pay-as-you-go activé** → l'API OCR (`mistral-ocr-latest`) répond `429 rate_limited`
  sur quasi tous les appels, quel que soit le débit réel (confirmé : conso très faible, ~0,12 €
  sur 8,5 € de crédit inclus, donc PAS un problème de quota épuisé — un forfait gratuit sans carte
  associée semble bridé plus fort que les limites affichées).
  Tentative d'activation du pay-as-you-go (carte ajoutée, CGU acceptées) : **le bouton
  « S'abonner » reste bloqué en chargement sans jamais partir en requête réseau** — bug côté page
  Mistral, pas côté nous. Aucun débit/facture n'a eu lieu. À réessayer en navigation privée / autre
  navigateur, ou contacter le support Mistral si ça persiste.
  Le code compense déjà ce qui peut l'être : `_shared/http.ts` retente 2x sur 429 (2s/4s),
  `charges.ocr_lecture` (jsonb) cache tout résultat définitif pour ne jamais relire deux fois la
  même facture, et la lecture n'est plus automatique dans les files d'attente Carburant/Entretiens
  (bouton « Lire la facture » à la demande, PR #27 — **vérifier si mergée**, sinon merger si CI
  verte et testée). Tant que le pay-as-you-go Mistral n'est pas actif, l'OCR restera indisponible
  quoi qu'on fasse côté code — ne pas re-diagnostiquer ce point sans redemander l'état du compte
  Mistral à l'utilisateur.
- **Hébergement : Cloudflare Pages fait foi pour `app.mcalogistics.fr`, PAS Netlify.**
  Confirmé par DNS (CNAME → `mca-logistics-app.pages.dev`, IP Cloudflare). Le projet Netlify
  (espace renommé **« MCA LOGISTICS APP »**, ex-« Vinted Achraf ») a un certificat expiré et une
  « Pending DNS verification » — mort pour ce domaine, mais sert encore les **previews de PR**
  (deploy-preview-N--gleaming-marzipan-9f0a30.netlify.app) tant que ses crédits mensuels
  (quasi épuisés, reset le 10 de chaque mois) ne tombent pas à zéro. Donner systématiquement le
  lien de preview (Netlify et/ou Cloudflare Pages, présent dans les commentaires bot de la PR)
  **avant** de merger, sur demande explicite de l'utilisateur.

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
- Économie de tokens : voir `TOKEN-ECONOMY.md`. Vérifier une étape via le sous-agent `/verificateur`.
