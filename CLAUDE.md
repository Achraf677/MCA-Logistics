# CLAUDE.md — Mémoire permanente du projet MCA

> Claude Code lit ce fichier au démarrage de CHAQUE session. **Il fait foi.**
> Il est tenu à jour PAR Claude à la fin de chaque grosse session (voir « Rituel de fin »).
> Dernière mise à jour : **01/10/2026** (Devis : lots D1 + D2).

---

## 0. Les 5 réflexes (à relire avant CHAQUE tâche)
1. **Lire avant d'écrire** : ce fichier, puis la fiche de revue de l'onglet (`mca-spec/revue/`),
   puis `mca-spec/CARTE-INTERCONNEXIONS.md` si on touche une table, une colonne, une Edge ou un statut.
2. **Vérifier les interconnexions** avant de pousser : qui d'autre lit / écrit ce que je change ?
   (grep `from('<table>')`, le nom de la colonne, la fonction, l'Edge) — voir § 7.
3. **Une donnée = une seule saisie.** Si une info existe déjà quelque part (fiche client, tarif,
   paramètres), on la LIT, on ne la redemande pas. Si on la fige (prix sur un relevé), on le dit.
4. **Ne jamais inventer** une info manquante (métier, légal, chiffre) : demander.
5. **Rituel de fin** (§ 10) à chaque fin de grosse session : mettre à jour ce fichier, la fiche de
   revue, la carte des interconnexions. Sans ça, la session suivante repart à l'aveugle.

---

## 1. Identité & vocabulaire
- Projet : **site de gestion interne MCA Logistics** (PGI/TMS maison). Transport routier sub-3,5 t,
  Strasbourg / Ostwald. Prod : `app.mcalogistics.fr`.
- ✘ Ne jamais écrire « DelivPro » (abandonné), ni « v1 / v2 ». **Une seule version : celle-ci.**
- L'ancien essai abandonné = « ancien essai » / « résidus en base ». Pas « v1 ».
- Utilisateur : président de la société, étudiant en comptabilité. Réponses **courtes**, en
  tirets, concrètes. Pas de blabla, pas de tableau dans les critiques.

## 2. Métier (à garder en tête sur CHAQUE écran)
- **Express** : course unitaire retrait → livraison, souvent dans la journée, parfois urgente
  (créneau / heure limite). Une course = 2 arrêts.
- **Messagerie** (activité ACTUELLE, depuis 09/2026) — **facturation validée le 01/10/2026** :
  - prix HT **au colis** (ex. 1 € / colis), saisi UNE fois dans la fiche client
    (tarif « Au colis (messagerie) », `clients.tariff_mode = 'colis'`, `tariff_rate_cts` = prix) ;
  - chaque mois, **une** ligne `deliveries` `prestation = 'messagerie'` = **relevé** :
    mois (date = fin de mois), `nb_colis` livrés, `prix_unitaire_cts` figé ;
  - HT = colis × prix ; le relevé naît **« livrée »** (prêt à facturer, sans preuve unitaire) ;
  - facture Pennylane : 1 ligne, quantité = colis, PU = prix au colis ;
  - ni arrêt ni chauffeur : exclu de Mes courses, Tournées, Planning, Calendrier, journée du
    Dashboard (filtre `prestation.is.null,prestation.not.in.(messagerie,forfait)`).
- **Prestations** (`deliveries.prestation`) : `express` · `messagerie` (relevé) · `dediee` ·
  `mise_a_dispo` (un lieu, début / fin) · `forfait` (aucun arrêt). `null` = ancienne course = express.
- Tout écran doit servir tous les cas : ne jamais coder « 1 course = 1 colis = 1 arrêt » en dur.
- **Client = celui qui commande ET paie** (plateforme, commissionnaire). Un particulier livré
  ou enlevé est un CONTACT d'arrêt (qui remet / qui reçoit), pas un client. Pas de « payeur ».
- **La fiche client porte les défauts de ses courses** (pays, retrait habituel + contact,
  chauffeur / véhicule habituels, prestation, référence obligatoire, suppléments + prix) :
  une nouvelle course les reprend dans ses cases vides.
- Légal transport à respecter : lettre de voiture (arrêté du 9/11/1999 : poids OU volume,
  état récapitulatif pour les tournées), échéance ≤ 30 j date de facture (L441-11), indexation
  gazole en pied de facture (L3222-1/2), CMR hors France, e-facture 09/2027 (SIREN client).

## 3. Stack & environnements
- React + TypeScript + Tailwind v4 (`@tailwindcss/vite`) · Vite · Supabase (Postgres + RLS +
  Auth + Storage + Edge Functions Deno). Vitest pour les tests. Dev local `http://localhost:5173`.
- Supabase : projet `pzfgtcugmqeqixogwzcu` (eu-west-3). Ancien projet `lkbfvgnhwgbapdtitglu` : **mort**.
- Front : **anon key uniquement** (`src/app/providers.tsx`). **Service role : JAMAIS côté front**,
  uniquement dans les Edge (`Deno.env`).
- **Hébergement : Cloudflare Pages fait foi** (CNAME → `mca-logistics-app.pages.dev`). Netlify
  (« MCA LOGISTICS APP ») = mort pour le domaine, sert parfois des previews.
- Preview de PR : `https://<branche>.mca-logistics-app.pages.dev` (commentaire du bot Cloudflare).
  Ses URL doivent être dans Supabase → Auth → Redirect URLs, sinon la connexion Google renvoie
  vers la prod et on teste l'ancien code sans le savoir.
- ⚠️ La preview tape la **base de PROD** : une colonne nouvelle n'existe pour elle qu'une fois la
  migration appliquée (additive = sans risque, on demande avant).
- IA : Mistral (UE). Lecture des justificatifs par **vision** (`ministral-14b-2512`,
  `_shared/mistral.ts#generateJsonFromImage`) ; `/v1/ocr` n'est PAS ouvert (gratuit). Pennylane
  sert tout en PDF, `public_file_url` expire → `_shared/justificatif.ts#urlFraichePennylane`.

## 4. Architecture (règle d'or)
```
src/
├── app/        Shell.tsx, routes.tsx, providers.tsx, sections/ (8 sections du menu)
├── shared/     ui/ (composants), lib/ (logique transverse + quelques queries partagées)
└── features/   1 dossier par onglet : <X>.tsx, <x>.queries.ts, <x>.types.ts, <x>.logic.ts, Drawer<X>.tsx
supabase/
├── migrations/ UP + DOWN (DOWN en commentaire), additives
└── functions/  Edge Deno ; code commun dans _shared/
```
- **Aucun nouvel import entre `features/`.** Exceptions EXISTANTES, connues, à ne pas étendre :
  `assistant` (hub IA, lit tout), `planning` / `tournees` / `dashboard` → `livraisons`
  (drawer + types), `livraisons` → `parametres`. Besoin partagé → `shared/lib/`.
- Calculs métier dans `*.logic.ts` UNIQUEMENT (fonctions pures, testées). DB dans `*.queries.ts`.
- **Tout appel API externe via une Edge Function.** Jamais depuis le navigateur.
- Montants en **centimes** (`*_cts`), formatés via `shared/lib/money.ts`. Dates du jour en
  **local** (`isoLocal`), jamais `toISOString().slice(0,10)` (veille avant 2 h).
- Échéances via `shared/lib/echeances.ts`. Statuts de livraison via `shared/lib/livraisonStatuts.ts`.
- Une règle métier qui existe côté Edge ET côté front (ex. lignes de facture) = **miroir testé
  des deux côtés** (`_shared/lignesFacture.ts` ↔ `livraisons/apercuFacture.logic.ts`).

## 5. Base de données — pièges (NE PAS réintroduire)
- `deliveries.montant_*` **n'existent PAS en prod** (vérifié le 01/10/2026) → jamais les écrire
  ni les mettre dans un `select` (la requête échoue et l'écran se vide en silence). Montants :
  `amount_ht_cts`, `tva_cts`, `amount_ttc_cts`. (`montant_*` existent sur `charges`.)
- Toute colonne lue / écrite par le front ou une Edge doit EXISTER en prod avant le merge :
  vérifier dans `information_schema.columns` (le 5e audit du 01/10 en a trouvé 3).
- `deliveries.statut` ∈ `planifiee, en_cours, livree, facturee, payee, annulee` (check) ;
  nouvelle valeur = migration de la contrainte.
- `deliveries.notes` = **consignes chauffeur** (visibles dans Mes courses). `note_interne` = bureau.
- `deliveries.weight_kg` = poids kg (lu par le chauffeur) — ne PAS y mettre des palettes.
- `deliveries.arrival_time` = heure calculée par les **tournées** (remise à null au détachement) ;
  les créneaux saisis sont `creneau_retrait_*` / `creneau_livraison_*`.
- `lv_pdf_url` = `doc:<id>` (Storage) ou ancien lien Drive ; jamais une URL signée.
- `lv_numero` unique par société (index `deliveries_company_lv_numero_uniq`).
- `clients.tariff_mode` ∈ `forfait, km, palette, colis, manuel`.
- `clients.pays` ISO alpha-2 (FR par défaut) → adresse Pennylane + autoliquidation auto.
- Délai de paiement transport ≤ 30 j date de facture : options `conforme` seulement ; l'Edge
  plafonne l'échéance (`echeanceTransport`).
- Migrations : UP **et** DOWN, colonnes nullables / additives, appliquées via MCP Supabase.

## 6. Machine à états Livraisons (source : `shared/lib/livraisonStatuts.ts`)
- `planifiee→{en_cours, livree, annulee}` · `en_cours→{livree, annulee}` · `livree→{facturee}` ·
  `facturee→{payee}` · `payee→{}` · `annulee→{}`. Toujours via `canTransition`.
- **→ facturee : c'est l'Edge `pennylane-invoice` qui écrit le statut**, après avoir créé la
  facture. Échec → message clair (`ResultatFacturation`), `sync_error` sur la course ; course
  « facturée sans facture » (ancien fonctionnement) → bouton « Revenir à livrée ».
- → livree pose `delivered_at`. Un relevé de messagerie est **créé** directement en `livree`.
- **Seule transition « système » hors machine** : `facturee → annulee` posée par l'Edge
  `pennylane-payment-check` quand la facture est annulée par un avoir chez Pennylane (le site
  ne la propose jamais à la main ; l'avoir depuis le site = lot C).
- Échéances, retards, relances, encours : délai client **plafonné à 30 j**
  (`shared/lib/paymentTerms#delaiTransportJours`) ; TTC dû = `deliveryTotalTtcCts`
  (suppléments compris, sans TVA en autoliquidation).

## 7. Interconnexions — la règle
Avant de modifier une table, une colonne, un statut, une Edge ou une règle de calcul :
1. Ouvrir `mca-spec/CARTE-INTERCONNEXIONS.md` (qui lit / écrit quoi).
2. Vérifier en vrai : `grep -rn "from('<table>')"`, `grep -rn "<colonne>" src supabase/functions`.
3. Pour chaque lecteur : faut-il l'adapter (filtre, libellé, calcul, exclusion) ? Le faire dans
   la même PR, ou le noter dans la PR comme « non concerné, parce que… ».
4. Edge touchée → l'ordre de mise en prod compte (§ 9). Colonne lue par une Edge → migration AVANT.
5. Mettre à jour la carte si une dépendance apparaît / disparaît.
Exemples déjà payés cher : une colonne ajoutée au `select` du front avant la migration casse
l'écran ; un relevé de messagerie non exclu apparaît comme « adresse manquante » chez le chauffeur.

## 8. UI — conventions validées
- Gestes secondaires en pictogramme : `shared/ui/BoutonIcone` (40 px ; `taille="sm"` 28 px en
  liste ; `actif` = ouvert). Réglages d'affichage dans `PanneauReglages` (roue). Pictos lucide,
  **pas d'emoji**.
- **Adaptatif** : racine 14 px (grand écran, mobile) → 11 px (petit PC), `src/index.css`
  « Racine adaptative ». 1rem = 14 px. Tailles de mise en page en `rem`, jamais en px fixes.
- **Un onglet de consultation tient sur un écran PC** sans défiler (modèle Dashboard). Mobile :
  une colonne qui défile.
- **Fiches de saisie** (modèle : fiche livraison) : tiroir large 2 colonnes PC / 1 mobile, blocs
  titrés, barre d'actions fixe en bas, validation progressive (seul le strict minimum bloque,
  le reste en bandeau « Il manque pour… »), valeurs par défaut lues ailleurs (client, paramètres).
- ⚠️ `text-[var(--fs-*)]` = compilé en `color:` par Tailwind v4 → **interdit** dans du code neuf
  (`text-xs`, `text-sm`, `text-[length:var(--fs-xs)]`). ~700 usages anciens : correctif global à décider.
- `.glass` sans backdrop-filter sur ce qui défile (perf).

## 9. Workflow Git / mise en prod
- Branche par étape (`feat/…`, `fix/…`, ou la branche imposée par la session). PR vers `main`.
- **Merge seulement sur « merge » explicite** de l'utilisateur, après lui avoir donné la preview.
- Avant de pousser : `npx tsc -b` · `npx vitest run` · `npx eslint src` (0 erreur) · `npx vite build`
  · relecture adversariale du diff · captures PC (1920 et 1366) + mobile (390) si UI.
- **Ordre de mise en prod** : 1) migrations (additives) → 2) merge (Cloudflare déploie le front)
  → 3) Edge Functions touchées (MCP `deploy_edge_function`, fichiers `../_shared/*` inclus,
  `verify_jwt` inchangé). Aucune migration ni Edge avant accord (« merge » ou demande explicite).
- Jamais d'identifiant de modèle IA dans un commit / une PR. Confirmer les hash après merge.

## 10. Rituel de fin de grosse session (OBLIGATOIRE)
À la fin d'une session qui a changé du code, une règle ou une décision :
1. **Ce fichier** : mettre à jour § 2 (métier), § 5-6 (pièges, statuts), § 11 (état), § 12
   (en cours / à décider), la date en tête. Supprimer ce qui est devenu faux.
2. **Fiche de revue** de l'onglet (`mca-spec/revue/NN-*.md`) : écran, gestes, données, lots faits.
3. **`mca-spec/CARTE-INTERCONNEXIONS.md`** : nouvelles tables / colonnes / lecteurs / Edge.
4. Vérifier que ce qui est noté « fait » est **mergé ET déployé** (migrations, Edge).
5. Proposer à l'utilisateur la mise à jour du skill `mca-site` si l'architecture a bougé.
6. Commit dédié « Mémoire : … » poussé avec le reste.

## 11. État actuel (01/10/2026)
- 8 sections (`src/app/sections/`) : **Pilotage** (Dashboard) · **Livraisons** (Livraisons, Devis,
  Modèles, Lettres de voiture) · **Finance** (Trésorerie, Charges, Encaissement, TVA, Relances) ·
  **Flotte** (Véhicules, Carburant, Entretiens, Inspections, Incidents) · **Planning** (Tournées, Planning : vues par chauffeur / par jour / mois — l'ancien Calendrier y est fondu) · **Tiers**
  (Clients, Fournisseurs, Devis) · **Équipe** (Équipe, Heures) · **Système** (Paramètres, Admins,
  Modèles). Hors menu : **Mes courses** (chauffeur) et la cloche **Alertes**. ~30 `features/`.
  Les specs `mca-spec/tabs/` n'en couvrent qu'une partie : vérifier le code.
- Revue onglet par onglet (méthode § 13) : 01 Mes courses ✔ · 02 Dashboard ✔ · 03 Livraisons ✔
  (liste, facturation, lettre de voiture, sécurité) · 03b Fiche livraison ✔ (lot A + messagerie)
  · 04 Planning ✔ (lots P1-P4 : vue par chauffeur, affectation rapide, tournées en retard,
  calendrier enrichi, puis fondu dans le Planning en vue « Mois »).
- Fiche livraison : prestation, client avec recherche, référence client (reprise sur la facture),
  urgent, arrêts complets (contact, téléphone, créneaux), trajet auto (IGN), marchandise
  (colis, poids, volume), consignes / note interne, Dupliquer, 3 onglets (Course · Preuves &
  documents · Facturation).

## 12. En cours / à décider (mettre à jour à chaque session)
- **Audit du 01/10/2026** : `mca-spec/AUDIT-2026-10-01.md` (manques et bugs par section,
  classés bloquant / important). À relire avant de toucher Tiers, Finance, Flotte.
- **Lots fiche livraison** (`mca-spec/revue/03b-fiche-livraison.md`) : B fait (fiche client) ·
  C échecs & annulation
  (relivrer, retour dépôt, avoir) · D tournées de colis (import, scan, LV de tournée) · E facture
  conforme (indexation gazole, pays client, CMR).
- Dashboard : compter les **colis** de messagerie (aujourd'hui un relevé = 1 livraison dans les
  compteurs ; le CA est juste).
- Devis : D1 + D2 faits (PR #41 : prix au colis, suppléments, « Appliquer ce prix au client »,
  « Créer la course ») ; restent D3 (Edge pennylane-quote : lignes, pays / TVA client) et D4 (liste).
- ~20 fiches clients « particuliers » jetables (anciennes courses de plateformes) : fusionner
  ou désactiver ? (à décider)
- 1 client au délai 60 j (non conforme) : le repasser à 30 j dans sa fiche.
- Correctif global `text-[var(--fs-*)]` : PR dédiée à décider.
- Chauffeur : supprimer ses propres photos dans l'heure ? (question ouverte)
- **Dépenses véhicule** (Carburant + Entretiens) : plan `mca-spec/tabs/30-depenses-vehicule.md`
  à lire AVANT d'y toucher ; étapes 0-1 faites, étape 2 (table unifiée) attend le « go ».
  Pas d'immobilisation ni de prorata km dans ces écrans.
- Planning : changer chauffeur / jour détache la course de sa tournée (choix à confirmer) ;
  heure de début de tournée = suggestion tant que `tours.started_at` n'existe pas.
- Onglets suivants de la revue : Modèles, puis le menu dans l'ordre.

## 13. Revue onglet par onglet (méthode validée le 30/09/2026)
- Un onglet à la fois : critique mobile + PC (bon / pas bon / à ajouter) → validation → PR +
  preview → test → merge → onglet suivant.
- **1 onglet = 1 fichier** `mca-spec/revue/NN-<onglet>.md`, qui fait foi et se met à jour à chaque
  PR. Plan : 1 Rôle · 2 Qui voit quoi · 3 L'écran de haut en bas · 4 Gestes et écritures ·
  5 Données lues · 6 Fichiers · 7 Critique · 8 Lots · 9 À tester. Modèle : `01-mes-courses.md`.
- Se placer en **gestionnaire d'une société de transport** : saisie, cas réels, légal, double saisie.

## 14. Pilotage Claude Code
- Une étape = une seule chose ; lire seulement les fichiers utiles ; s'arrêter au critère d'arrêt.
- Sous-agents pour les lectures lourdes / tâches parallèles (contexte isolé) ; vérifier une étape
  avec `/verificateur`. Économie de tokens : `TOKEN-ECONOMY.md`.
- Specs onglets : `mca-spec/tabs/` · intégrations : `mca-spec/integrations/` · revue : `mca-spec/revue/`.
