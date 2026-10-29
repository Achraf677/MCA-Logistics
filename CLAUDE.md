# CLAUDE.md — Mémoire permanente du projet MCA

> Claude Code lit ce fichier au démarrage de CHAQUE session. **Il fait foi.**
> Il est tenu à jour PAR Claude à la fin de chaque grosse session (voir « Rituel de fin »).
> Dernière mise à jour : **29/10/2026** (allégé : détail déplacé dans `mca-spec/HISTORIQUE.md`).


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
- **Règle des fichiers .md (demandée le 19/10/2026)** : aucun blabla explicatif. Que du fait utile (règle,
  piège, décision, état). Une info = une phrase ou un tiret. Quand on touche un .md, on retire le texte
  qui n'apprend rien (historique de débogage, justification longue, redite).
- **Règle de réponse (18/10, rappelée 22/10 et 26/10/2026 ; TOUTES les conversations, TOUJOURS)** :
  courte, que des tirets, zéro introduction / conclusion / paragraphe, mots de tous les jours.
  L'utilisateur ne connaît pas l'informatique : jamais de jargon, jamais de détail technique.
  Les rapports d'agents suivent la même règle.
- **Déroulé par onglet** : l'utilisateur valide le plan AVANT le code ; ensuite preview → « quoi tester » → validation → merge → onglet suivant.

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
  - **Tournée de colis** (lot TC1, 17/10/2026) : la feuille de route Colissimo du matin
    — bandeau « 67170 KRIEGSHEIM » = commune des lignes suivantes ; District = SECTEUR, pas
    commune ; colonnes Rue | Nb Colis | Nb PGEO | N° | CRBT/taxes ; « 5(2) » = 2 colis (exposant),
    « RC13(21) » = relais, « [C]11 » = collecte (carré noir), « ? » illisible ; contrôle par
    ligne colis = Nb Colis et numéros = Nb PGEO ; « x/y » en bas à droite ; communes déléguées
    par alias BAN (Mittelhausen / Hohatzenheim / Gingsheim → Wingersheim les Quatre Bans 67170,
    Keffendorf → Ohlungen 67590) — est photographiée page par page, lue par
    l'Edge `lire-feuille-route`, puis traitée arrêt par arrêt dans Mes courses › Ma tournée.
    Tables `tournees_colis` / `tournees_colis_arrets` : **ce ne sont PAS des deliveries**
    (le relevé mensuel reste la seule ligne de facturation). Chaîne de comptage (lot 5) :
    tournée clôturée → journée de colis préremplie en brouillon (le salarié envoie, le
    bureau valide) → relevé du mois propose les colis des journées VALIDÉES.
    **Scan v2 (18/10/2026)** : table `referentiel_rues` = base de l'outil de tournée d'origine
    (villages du secteur, noms officiels des rues, position de chaque numéro, ordre habituel,
    relais) ; la lecture s'en sert pour que le salarié n'ait RIEN à corriger. La tournée naît
    dans l'ordre habituel (`ordre_mode = 'habituel'`). Départ des tournées = centre de tri
    La Poste de Vendenheim (`companies.depart_colis_*`, Paramètres).
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
  = mort, ignoré.
- **Liens de preview (règle du 29/10/2026, remplace celle du 26/10)** : donner à l'utilisateur UNIQUEMENT le lien de preview **Cloudflare** de la PR (`*.pages.dev`, commentaire du bot Cloudflare sur la PR). **JAMAIS un lien Netlify.**
  Connexion Google sur une preview : son URL doit être dans Supabase → Auth → Redirect URLs, sinon retour vers la prod (tester par e-mail).
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
  des deux côtés** (`_shared/lignesFacture.ts` ↔ `shared/lib/lignesPennylane.ts`, utilisé par
  `livraisons/apercuFacture.logic.ts` et `devis/devis.logic.ts`).
- **Devis = fiche livraison** (uniformisés le 02/10/2026) : mêmes blocs, mêmes composants, mêmes
  noms de colonnes, mêmes défauts client. Briques partagées : `shared/ui/FicheSaisie` (Bloc,
  ChoixClient, ChoixPrestation), `shared/ui/LignesSupplementaires`, `shared/lib/prestations`
  (types + `blocsPrestation`), `shared/lib/paymentTerms#libelleDelaiPaiement`. Toute évolution
  d'un des deux formulaires se fait dans ces briques ou se reporte sur l'autre.

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
- Lettre de voiture, Modèles, Inspections, Incidents : SUPPRIMÉS du site (22/10/2026, CMR papier). Colonnes `lv_*`,
  `expediteur_siren`, table `delivery_templates` : gardées en base, plus écrites. `lv_pdf_url` (`doc:<id>` ou ancien
  lien Drive) compte encore comme justificatif (alerte « sans justificatif »).
- `clients.tariff_mode` ∈ `forfait, km, palette, colis, manuel`.
- `clients.pays` ISO alpha-2 (FR par défaut) → adresse Pennylane + autoliquidation auto.
- `clients.siret` = 14 chiffres SEULEMENT ; le SIREN (9) va dans `clients.siren` (U2).
- Délai de paiement transport ≤ 30 j date de facture : options `conforme` seulement ; l'Edge
  plafonne l'échéance (`echeanceTransport`).
- `documents.statut_tri` ∈ `a_trier, propose, classe` ; `documents.proposition` (jsonb) = proposition de l'IA, vidée à la confirmation ; `drive_file_id / drive_url / drive_chemin` = fichier rangé dans le Drive. Les justificatifs de dépense sont dans `receipts_inbox`, PAS dans `documents`.
- Migrations : UP **et** DOWN, colonnes nullables / additives, appliquées via MCP Supabase.

## 6. Machine à états Livraisons (source : `shared/lib/livraisonStatuts.ts`)
- `planifiee→{en_cours, livree, annulee}` · `en_cours→{livree, annulee}` · `livree→{facturee}` ·
  `facturee→{payee}` · `payee→{}` · `annulee→{}`. Toujours via `canTransition`.
- **→ facturee : c'est l'Edge `pennylane-invoice` qui écrit le statut**, après avoir créé la
  facture (et `quotes.statut = facture` pour le devis accepté de la course, lot U4). Échec → message clair (`ResultatFacturation`), `sync_error` sur la course ; course
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
- **Actions longues (24/10/2026)** : optimiste, jamais de rechargement de liste : l'élément disparaît / change tout de suite, l'envoi part en arrière-plan, un échec le remet avec un message (modèle : `documents/ConfirmationTri`, `patch` local).
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
  Look commun (22/10/2026) : `Bloc` = surface propre + titre net (`shared/ui/FicheSaisie`), champs `.field` un cran plus clair
  que le bloc, libellés lisibles (jamais en capitales), prestation en contrôle segmenté, suivi en frise horizontale.
- **Marque (22/10/2026)** : logo `public/logo-mca.png` (fond blanc, posé sur une pastille blanche) dans la barre latérale et la connexion ; rouge #d0021b, or, anthracite ; thème « Clair MCA » (blanc beige, `themes.ts`, `data-theme="clair"`) choisi dans Système › Apparence.
- ⚠️ `text-[var(--fs-*)]` = compilé en `color:` par Tailwind v4 → **interdit** dans du code neuf
  (`text-xs`, `text-sm`, `text-[length:var(--fs-xs)]`). ~700 usages anciens : correctif global à décider.
- `.glass` sans backdrop-filter sur ce qui défile (perf).
- **Recherche (23/10/2026)** : toute barre de recherche = `shared/ui/BarreRecherche` (halo, effacer, Échap, compteur, raccourci « / »), jamais un `<input>` nu.
- **Sélection = contour rouge de la marque (29/10/2026)** : tuiles, pastilles de filtre et bascules sélectionnées gardent le contour rouge sur fond noir (l'utilisateur l'aime : ne pas passer en neutre). Vue Carburant : filtre véhicule fait pour 20+ véhicules (liste avec recherche + classement compact « Voir les N véhicules »).
- **Listes déroulantes (24/10/2026)** : `shared/ui/ListeDeroulante` (recherche, clavier) ; posée dans le tiroir Justificatifs, à étendre aux autres `<select>` natifs écran par écran.
- **Documents (23/10/2026)** : un PDF ou une photo s'ouvre dans l'appli par `ouvrirDocument(url, { titre, type })` (`shared/ui/VisionneuseDocument`, montée à la racine), jamais `window.open`. Exception : liens « Y aller » (navigation).

## 9. Workflow Git / mise en prod
- Branche par étape (`feat/…`, `fix/…`, ou la branche imposée par la session). PR vers `main`.
- **Merge seulement sur « merge » explicite** de l'utilisateur, après lui avoir donné la preview.
- Avant de pousser : `npx tsc -b` · `npx vitest run` · `npx eslint src` (0 erreur) · `npx vite build`
  · relecture adversariale du diff · captures PC (1920 et 1366) + mobile (390) si UI.
- **Ordre de mise en prod** : 1) migrations (additives) → 2) merge (Cloudflare déploie le front)
  → 3) Edge Functions touchées (MCP `deploy_edge_function`, fichiers `../_shared/*` inclus,
  `verify_jwt` inchangé).
- **Autonomie Supabase (décidée le 18/10/2026)** : Claude applique LUI-MÊME les migrations
  additives et déploie LUI-MÊME les Edge Functions, sans demander l'accord, dès que les
  vérifications sont vertes (tests, relecture, migration testée). Il le signale en une ligne
  dans son rapport. Il demande seulement avant une action destructive (suppression de table,
  de colonne ou de données) ou un changement de droits d'accès existants.
- **Mise à jour du CLAUDE.md à CHAQUE PR (26/10/2026, automatique, sans qu'on le demande)** : avant de pousser la PR, mettre à jour ce fichier (§ 11, date en tête ; le détail va dans `mca-spec/HISTORIQUE.md`) + la fiche de revue + la carte des interconnexions si concernées, dans la MÊME PR. Après un merge, si l'état a changé, PR « Mémoire : … » de suite.
- Jamais d'identifiant de modèle IA dans un commit / une PR. Confirmer les hash après merge.

## 10. Rituel de fin de grosse session (OBLIGATOIRE)
À la fin d'une session qui a changé du code, une règle ou une décision :
1. **Ce fichier** : mettre à jour § 2 (métier), § 5-6 (pièges, statuts), § 11 (état)
   (en cours / à décider), la date en tête. Supprimer ce qui est devenu faux.
2. **Fiche de revue** de l'onglet (`mca-spec/revue/NN-*.md`) : écran, gestes, données, lots faits.
3. **`mca-spec/CARTE-INTERCONNEXIONS.md`** : nouvelles tables / colonnes / lecteurs / Edge.
4. Vérifier que ce qui est noté « fait » est **mergé ET déployé** (migrations, Edge).
5. Proposer à l'utilisateur la mise à jour du skill `mca-site` si l'architecture a bougé.
6. Commit dédié « Mémoire : … » poussé avec le reste.
7. **Rapport de fin de session (CHAQUE session, toujours court, jamais détaillé).** Que des tirets,
   mots de tous les jours, dans CET ordre et rien d'autre :
   - **Fait** : 2 à 5 tirets, ce qui change pour lui.
   - **À tester** : tirets, ce qu'il doit cliquer / vérifier.
   - **À décider** : seulement s'il y a une vraie question.
   - **Lien de preview TOUT À LA FIN**, seul sur sa ligne (règle § 3).
   Interdit : liste de fichiers, SQL, noms de code, explications, rappel de ce qui n'a pas changé.
   Le détail technique va dans la PR et dans ce fichier, pas dans le message.

## 11. État actuel & à décider (29/10/2026)
> Le détail (lots faits, versions d'Edge, chiffres, bancs de test) est dans `mca-spec/HISTORIQUE.md` : ne le lire QUE si on touche la zone concernée (grep). Ici : le strict utile.
- 8 sections (`src/app/sections/`) : Pilotage · Livraisons (Livraisons, Devis) · Finance (Trésorerie, Charges, Justificatifs) · Flotte · Planning (Tournées, Planning) · Tiers · Équipe · Système (Paramètres, Documents, Cartes bancaires, Admins). Hors menu : Mes courses (salarié), Alertes. Les specs `mca-spec/tabs/` sont partielles : vérifier le code.
- Trésorerie : solde Qonto + solde compte pro Pennylane (Edge `pennylane-solde`, déployée le 29/10 ; à vérifier sur les vrais comptes : unité de `balance`).
- Activité actuelle : messagerie Colissimo (tournées de colis scannées, relevé mensuel). Express retiré de Mes courses.
- Fiches de revue : `mca-spec/revue/NN-*.md` (une par onglet).
- **À faire par l'utilisateur** : activer le hook « Password verification attempt » (Supabase → Auth → Hooks) ; reconnecter Google dans Paramètres (cocher Drive) puis tester Documents sur de vrais fichiers ; tester l'interface salarié sur un vrai compte.
- **À décider** : ordre des villages (onglet « Villages » du fichier Excel) · zones collées à Brumath (changer la zone dans `zones_rues` si demandé) · Lucas rentre-t-il à Vendenheim · alerte « ordre manuel plus long que le calculé » · Mistral gratuit vs Claude Haiku pour la lecture des photos · ~20 fiches clients « particuliers » jetables (fusionner / désactiver) · 1 client à 60 j à repasser à 30 j · correctif global `text-[var(--fs-*)]` · chauffeur : supprimer ses photos dans l'heure ? · Planning : changer chauffeur / jour détache la course de sa tournée.
- **Chantiers ouverts** : Pennylane U6 (mentions légales ; manque la part du gazole %), U7 charges, U8 ménage · Dépenses véhicule étape 2 (attend le « go ») · Dashboard : compter les colis de messagerie · Devis D4 (expiration, relance > 7 j) · Refonte par onglet : Système (Paramètres, Admins) fait ; **Flotte arrêtée après Véhicules (décision du 29/10)** — non fait : Carburant HT + conso, Entretiens HT, coût 12 mois (carburant aussi dans Finance › Justificatifs : arbitrer si reprise) ; reste les `<select>` natifs → `ListeDeroulante`.
- Plans de référence : `mca-spec/UNIFORMISATION-PENNYLANE.md`, `PLAN-ESPACE-SALARIE.md`, `DECISIONS-2026-10-22.md`, `AUDIT-2026-10-01.md`.

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
- **Carte du code (graphify, testée le 03/10/2026)** : `scripts/graphe.sh` (génère en ~6 s, local,
  sans IA) puis `scripts/graphe.sh explain <symbole>` = qui importe / appelle une fonction, un
  type, un composant (ex. avant de modifier `deliveryTotalTtcCts` : 21 liens en ~400 jetons au
  lieu de lire 10 fichiers). **Ne voit PAS** les tables / colonnes / Edge appelées par chaîne
  (`from('deliveries')`, `functions.invoke('pennylane-invoice')`) ni le SQL : pour ça,
  `CARTE-INTERCONNEXIONS.md` + grep restent la règle (§ 7). `graphify-out/` n'est pas versionné.
- Specs onglets : `mca-spec/tabs/` · intégrations : `mca-spec/integrations/` · revue : `mca-spec/revue/`.
- **Économie de tokens (29/10/2026)** : ce fichier reste sous ~25 Ko (relu à chaque session). Tout détail d'historique va dans `mca-spec/HISTORIQUE.md`, jamais ici. Ne lire que les fichiers de l'étape ; sous-agent seulement pour une lecture lourde isolée.
