# CLAUDE.md — Mémoire permanente du projet MCA

> Claude Code lit ce fichier au démarrage de CHAQUE session. Il fait foi.

## Identité & vocabulaire
- Projet : **site de gestion interne MCA Logistics** (PGI/TMS maison). Transport routier sub-3,5 t.
- ✘ Ne jamais écrire « DelivPro » (abandonné), ni « v1 / v2 ». **Une seule version : celle-ci.**
- L'ancien essai abandonné = « ancien essai » / « résidus en base ». Pas « v1 ».

## Métier (à garder en tête sur CHAQUE écran)
- **Express** (aujourd'hui) : course unitaire enlèvement → livraison, souvent dans la journée,
  parfois urgente (créneau / heure limite). Une course = 2 arrêts (retrait, livraison).
- **Messagerie** (à venir) : tournées de nombreux colis / arrêts, preuve par colis, échecs de
  livraison (absent, refus, adresse erronée…), retours au dépôt, relivraison.
- Tout écran doit servir les deux : ne jamais coder « 1 course = 1 colis = 1 arrêt » en dur.

## Revue onglet par onglet (méthode validée le 30/09/2026)
- Un onglet à la fois : critique mobile + PC (bon / pas bon / à ajouter) → validation →
  PR + preview Cloudflare → test → merge → onglet suivant.
- Format des critiques : tirets, pas de tableau, pas de blabla.
- **1 onglet = 1 fichier** `mca-spec/revue/NN-<onglet>.md`, qui fait foi et se met à jour à
  chaque PR sur l'onglet. Plan fixe : 1 Rôle · 2 Qui voit quoi · 3 L'écran de haut en bas ·
  4 Gestes et écritures · 5 Données lues · 6 Fichiers · 7 Critique · 8 Lots · 9 À tester.
  Modèle : `01-mes-courses.md`.
- Ordre : 01 Mes courses, puis les sections du menu dans l'ordre.

## UI — conventions validées
- Gestes secondaires en pictogramme : `shared/ui/BoutonIcone` (bouton carré bordé, 40 px ;
  `taille="sm"` 28 px dans les listes ; `actif` = ouvert). Ce qui se règle une fois
  (préférences, affichage) va dans `PanneauReglages`, replié derrière le bouton Réglages
  (roue). Appliquer à chaque onglet revu. Pas d'emoji, pictogrammes lucide.
- **Site adaptatif (PC)** : la taille racine suit l'écran (`src/index.css`, bloc « Racine
  adaptative ») — 14 px sur grand écran et mobile, jusqu'à 11 px sur petit écran PC.
  Base 1rem = 14 px. Écrire les tailles de mise en page en `rem` (jamais de px fixe pour
  une largeur de colonne / hauteur de bloc) pour qu'elles suivent.
- **Un onglet de consultation tient sur un écran PC** sans défiler (modèle : Dashboard,
  hauteur = `100dvh − topbar − marges`, dernière ligne en `flex-1`, listes défilantes
  à l'intérieur). Sur mobile, une colonne qui défile.
- ⚠️ `text-[var(--fs-*)]` est compilé par Tailwind v4 en `color:` (pas en taille) : ne pas
  l'utiliser dans du nouveau code → `text-xs`, `text-sm` ou `text-[length:var(--fs-xs)]`.
  Les ~700 usages existants : correctif global à décider (PR dédiée).

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
sous-onglets : **Pilotage** (Dashboard seul — Rentabilité et Statistiques retirées) · **Livraisons** (Livraisons,
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
- **Lecture des justificatifs : RÉSOLU (gratuit).** Le forfait gratuit Mistral n'ouvre PAS
  `/v1/ocr` (429 code 1300 permanent). On lit donc via **vision** (`ministral-14b-2512` sur
  `/chat/completions` + `image_url`, `_shared/mistral.ts#generateJsonFromImage`). Pennylane sert
  tout en PDF et `public_file_url` EXPIRE : `_shared/justificatif.ts` redemande une URL fraîche
  (`urlFraichePennylane`) puis ressort la photo JPEG du PDF. Relevés de carte (PDF texte) :
  Edge `lire-releve` (texte extrait par unpdf → modèle texte). Ne plus parler d'OCR payant.
- **Chantier en cours : « Dépenses véhicule » (uniformisation Carburant & consommables +
  Entretien & équipement).** Plan validé : `mca-spec/tabs/30-depenses-vehicule.md` — le lire
  AVANT toute modif de Carburant / Entretiens / produits. Étapes 0 (PR #29) et 1 (PR #30,
  Articles & familles + Paramètres en volets) faites ; étape 2 (table unifiée) en attente du
  « go ». Perf : `.glass` sans backdrop-filter (PR #31) — ne pas remettre de flou sur un
  élément qui défile. **Pas d'immobilisation ni de prorata km** dans
  ces écrans (reste en compta).
- **Hébergement : Cloudflare Pages fait foi pour `app.mcalogistics.fr`, PAS Netlify.**
  Confirmé par DNS (CNAME → `mca-logistics-app.pages.dev`, IP Cloudflare). Le projet Netlify
  (espace renommé **« MCA LOGISTICS APP »**, ex-« Vinted Achraf ») a un certificat expiré et une
  « Pending DNS verification » — mort pour ce domaine, mais sert encore les **previews de PR**
  (deploy-preview-N--gleaming-marzipan-9f0a30.netlify.app) tant que ses crédits mensuels
  (quasi épuisés, reset le 10 de chaque mois) ne tombent pas à zéro. Donner systématiquement le
  lien de preview (Netlify et/ou Cloudflare Pages, présent dans les commentaires bot de la PR)
  **avant** de merger, sur demande explicite de l'utilisateur.
  ⚠️ Pour tester une preview : ses URL doivent figurer dans Supabase → Authentication → URL
  Configuration → Redirect URLs (`https://*.mca-logistics-app.pages.dev/**`,
  `https://*--gleaming-marzipan-9f0a30.netlify.app/**`), sinon la connexion Google renvoie
  vers la prod (Site URL) et on teste l'ancien code sans s'en rendre compte.

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
