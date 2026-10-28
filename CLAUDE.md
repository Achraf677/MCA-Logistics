# CLAUDE.md — Mémoire permanente du projet MCA

> Claude Code lit ce fichier au démarrage de CHAQUE session. **Il fait foi.**
> Il est tenu à jour PAR Claude à la fin de chaque grosse session (voir « Rituel de fin »).
> Dernière mise à jour : **28/10/2026** (refonte par onglet : Livraisons, Planning / Tournées, Finance, Tiers, Équipe, Documents mergés ; page de connexion refaite ; zones de Brumath reprises du fichier de l'utilisateur ; reste Système et Flotte).

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
- **Règle de réponse (demandée le 18/10/2026, pour TOUTES les conversations)** : simple, que des
  tirets, zéro phrase d'introduction ou de conclusion, mots de tous les jours (pas de jargon
  technique sans l'expliquer). L'utilisateur ne lit pas les longs messages.
- **Style des rapports (26/10/2026, TOUJOURS)** : pas de blabla ; rapports UNIQUEMENT en tirets, courts, mots simples ; pas de paragraphes ni de phrases d'introduction / conclusion.
- **Réponses (rappel du 22/10/2026, toute la conversation)** : que des tirets, aucun blabla, aller vite.
  Rapports d'agents présentés par tiret, simples mais détaillés ; l'utilisateur valide les plans par onglet
  AVANT le code ; ensuite preview → « quoi tester » en tirets → validation → merge → onglet suivant.

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
  (« MCA LOGISTICS APP ») = mort pour le domaine, sert parfois des previews.
- **Liens de preview (règle du 26/10/2026)** : donner à l'utilisateur UNIQUEMENT le lien « deploy » de la PR, du type `https://deploy-preview-<n°PR>--gleaming-marzipan-9f0a30.netlify.app` (commentaire du bot Netlify, ex. PR 92 → `deploy-preview-92--…`). Jamais les liens `*.pages.dev` de Cloudflare.
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
- **Mise à jour du CLAUDE.md à CHAQUE PR (26/10/2026, automatique, sans qu'on le demande)** : avant de pousser la PR, mettre à jour ce fichier (§ 11-12, date en tête) + la fiche de revue + la carte des interconnexions si concernées, dans la MÊME PR. Après un merge, si l'état a changé, PR « Mémoire : … » de suite.
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
7. **Rapport de fin de session à l'utilisateur : le plus court et le plus simple possible.**
   Que des tirets, mots de tous les jours, 3 rubriques maximum : ce qui est fait · ce que
   l'utilisateur doit faire (s'il y a quelque chose) · ce qu'il doit décider. Pas de liste de
   fichiers, pas de SQL, pas de détails techniques, pas de rappel de ce qui n'a pas changé.
   Le détail technique va dans la PR et dans ce fichier, pas dans le message.

## 11. État actuel (24/10/2026)
- 8 sections (`src/app/sections/`) : **Pilotage** (Dashboard) · **Livraisons** (Livraisons, Devis) · **Finance** (Trésorerie, Charges ; Encaissement / Relances retirés le 22/10/2026) ·
  **Flotte** (Véhicules, Carburant, Entretiens) · **Planning** (Tournées, Planning : vues Jour / Semaine / Mois, refonte du 19/10/2026 ; l'ancien Calendrier y est fondu) · **Tiers**
  (Clients, Fournisseurs) · **Équipe** (Membres) · **Système** (Paramètres, **Documents**, Admins). Hors menu : **Mes courses** (chauffeur) et la cloche **Alertes**. ~30 `features/`.
  Les specs `mca-spec/tabs/` n'en couvrent qu'une partie : vérifier le code.
- Revue onglet par onglet (méthode § 13) : 01 Mes courses ✔ · 02 Dashboard ✔ · 03 Livraisons ✔
  (liste, facturation, sécurité) · 03b Fiche livraison ✔ (lot A + messagerie)
  · 04 Planning ✔ (refonte 19/10/2026 : Jour / Semaine / Mois, charge par chauffeur, tournées de colis du jour, menu d'actions ; `mca-spec/revue/04-planning.md`).
- **Tournées (bureau, refonte du 22/10/2026)** : l'onglet ne gère que les tournées de colis (tuiles cliquables, filtres, carte du jour, export CSV, tiroir Arrêts / Feuille de route / Synthèse ; `mca-spec/revue/04a-tournees.md`). Composeur express RETIRÉ : `tournees/{TourCard,…}` supprimés, Edge `optimize-tours` = 410 (v23), `_shared/{routesOrs,planifExpress,vroom}` supprimés ; `tours` / `tour_stops` gardés en base sans lecteur. Plus d'express dans Mes courses (Aujourd'hui = récap colis seulement). **Feuilles de route conservées** : à la création de la tournée chaque page scannée devient un `documents` (`tournee_colis`, `notes = 'feuille'`), plus effacée.
- **Clôture avec photos (20/10/2026)** : « Terminer ma tournée » ouvre une feuille avec les photos de la synthèse de fin de tournée (appareil ou galerie, plusieurs, envoyées tout de suite ; `documents` `entity_type = 'tournee_colis'`, migration `20261020100000_documents_synthese_tournee` appliquée) ; photos visibles côté bureau dans « Tournées de colis du jour » (liens Synthèse n) ; « Supprimer ce scan » dans l'aperçu du scan.
- **Pause d'un arrêt (21/10/2026)** : « Pause » sur chaque ligne, dans la barre du prochain arrêt et dans la fiche ; l'arrêt va dans un bloc « En pause (n) » en haut de Ma tournée (bouton Reprendre), le prochain arrêt passe au suivant ; `tournees_colis_arrets.en_pause_le` (migration `20261021090000_arrets_en_pause` appliquée) = affichage seulement (l'arrêt garde sa place dans l'ordre et le trajet, `inclureEnPause`) ; un résultat (livré, avisé…) sort de la pause ; compté non traité à la clôture ; le bureau voit « n en pause ».
- **Zones de Brumath + recherche d'adresse (22/10/2026)** : `tournees_colis_arrets.zone` (« ZONE 1 » à « ZONE 7 », tirée du secteur de la feuille par `zoneDeSecteur`, migration `20261022090000_arrets_zone` appliquée) = un « village » pour l'ordre (Edge `optimiser-tournee-colis` : commune + zone, un bloc par zone ; « Recalculer » (ex-« Réinitialiser ») refait l'ordre). Barre fine en haut de Ma tournée (`RechercheAdresse.tsx`) : cherche dans les arrêts, ouvre la fiche, corrige une adresse, ajoute un arrêt ; villages = ceux de `referentiel_rues` (21), CP et zone repris de la tournée, jamais devinés ; position relue par `geocode`. Crayon « Modifier l'adresse » sur chaque ligne et dans la fiche (`AdresseContexte`) ; zone choisie dans cette fiche. **Zones apprises** : `referentiel_rues.zone` + RPC `appliquer_zones_tournee` (apprend la zone de chaque rue lue, remplit les arrêts sans zone ; appelée à la création, avant chaque recalcul, après une correction) — migration `20261022100000_referentiel_zone` appliquée ; une tournée créée avant n'a pas de zone tant que ses rues ne sont pas apprises (re-scanner la feuille). **Zones du fichier Excel (22/10/2026)** : `Tournée Brumath et villages 23.xlsx` chargé dans `referentiel_rues` (`zone` / `zones`, 161 rues ; 23 rues coupées entre plusieurs zones gardent la zone lue sur la feuille) ; le calcul range les zones de Brumath dans l'ordre 1 → 7 (`ordonnerZones`, Edge `optimiser-tournee-colis` **v15 déployée le 22/10/2026** ; ordre à l'intérieur d'une zone = le plus court). **Bureau** : dans « Tournées de colis du jour », l'icône liste de chaque tournée ouvre ses arrêts (À faire / En attente / En retour / Tous, recherche, crayon pour corriger, + Ajouter, bouton Recalculer ensuite) ; `shared/ui/FeuilleAdresse` + `shared/lib/adresseTournee.logic` servent le livreur et le bureau. **Couleurs** village / zone : `infosGroupes` (liste : bandeau coloré par groupe ; carte : marqueurs, contour élargi de 70 m, route colorée par groupe, légende, bouton calques) ; les frontières postales exactes ne sont pas publiées : le contour vient des arrêts.
- **Colis par arrêt (20/10/2026)** : pastille « N colis » bien visible (liste, barre du prochain arrêt, fiche) ; « Livré » sur un arrêt à plusieurs colis ouvre une feuille avec une case par colis (toutes cochées, on décoche les non remis → `colis_remis`, le reste compte en attente) ; > 10 colis = compteur. Aucun changement de base : les arrêts déjà validés ne bougent pas.
- Mes courses (salarié) : **4 onglets depuis le 19/10/2026** (« Ma journée » supprimé : plus de journée de colis ; le relevé du mois compte les colis DIRECTEMENT depuis les tournées TERMINÉES du client — `tourneesColis.queries#colisDesTourneesClient`, `livraisons/ColisDesJournees` ; l'onglet « Courses » est devenu **Aujourd'hui** = récap du jour (colis livrés / en attente / retours, arrêts, km) ; l'express n'y est plus affiché depuis le 22/10/2026) — Aujourd'hui · **Ma tournée** (feuille de route scannée,
  ordre par la route, carte, Y aller, partage de position, photo de preuve, Terminer) · Dépenses · Moi. Tournées (bureau) : bloc « Tournées de colis du jour » (Carte du
  jour avec positions, calcul, rouvrir) + « Scanner pour un salarié ».
- Fiche livraison : prestation, client avec recherche, référence client (reprise sur la facture),
  urgent, arrêts complets (contact, téléphone, créneaux), trajet auto (IGN), marchandise
  (colis, poids, volume), consignes / note interne, Dupliquer, 3 onglets (Course · Preuves &
  documents · Facturation).

## 12. En cours / à décider (mettre à jour à chaque session)
- **Panne IGN (28/10/2026)** : l'IGN a supprimé la ressource d'itinéraire `bdtopo-osrm` (« Parameter 'resource' is invalid ») → depuis le 27/10 (404 avant) TOUS les calculs de tournée échouaient (503) et les tournées restaient dans l'ordre de la feuille (vu par l'utilisateur comme « zones non respectées, ordre dans n'importe quel sens ») ; `route-calc` (trajet de la fiche livraison) aussi en panne. Correctif : ressource `bdtopo-valhalla` dans `_shared/ign.ts` (une seule source, vérifiée sur getCapabilities) ; un tracé IGN en échec n'empêche plus d'enregistrer l'ordre (calculé sur la matrice ORS) : carte sans ligne + message. Solveur refait le même jour (`_shared/tourneeRoute#ordonnerTournee`, seule fonction appelée par l'Edge) : village par village, zones 1 → 7 imposées pendant la recherche, chaque rue d'un seul tenant (`PENALITE_RUE` = 300 m dans le coût, réglée sur le banc), numéros rangés dans une rue de 3 arrêts ou plus (croissant, décroissant ou un côté puis l'autre, si ≤ 150 m de plus), limite de 800 ms tenue ; l'Edge lit `tournees_colis_arrets.rue`. Banc routier réel (OSRM, hors prod) : tournée Brumath du 28/10 (128 arrêts) 74,8 km en ordre habituel → 58,7 km, zones 1 → 7, 2 rues coupées (10 avant) ; tournée du 27/10 62,5 → 49,5 km.
- **Zones de Brumath + optimisation (27/10/2026, PR « trajet »)** : fichier de l'utilisateur `Brumath adresses par zone.xlsx` (151 rues, zones 1 sud → 7 ouest, carte de contrôle) chargé dans la table `zones_rues` (migrations `20261027100000` et `20261027110000` appliquées) = SEULE source des zones (l'ancien fichier Excel donnait une autre numérotation : 43 arrêts sur 59 de la tournée du 27/10 avaient une zone différente). `appliquer_zones_tournee` : rue du fichier → sa zone (la feuille papier ne gagne plus) ; rue coupée (Millerand, de l'Herbe) → zone de la feuille si permise, sinon zone du point voisin ; rue absente → zone voisine, jamais de bloc « Brumath » isolé ; n'apprend plus rien. Edge `optimiser-tournee-colis` : `penaliserOrdreZones` impose 1 → 7 PENDANT la recherche (avant : on cherchait puis on rangeait les blocs, ce qui perdait les meilleurs points d'entrée / sortie) ; sur la tournée Brumath du 27/10 (59 arrêts, estimation vol d'oiseau × 1,3) 42,5 → 39,4 km ; sans l'ordre imposé des zones 35,6 km (le balayage 1 → 7 coûte ~4 km, choix de l'utilisateur). **PR #94 mergée, Edge v18 déployée le 27/10/2026** ; une tournée déjà créée garde son ordre : « Recalculer » (applique aussi les nouvelles zones). **À confirmer par l'utilisateur** : 10 rues du référentiel absentes du fichier (Chemin de la Hardt, Gaensweid, Lieu-dit Gottliebsacker, Lotissement Bellevue, Riedweg, Route de Weitbruch, Place du Marché, Rue des Pivoines, Rue d'Ohlungen, Rue de Berstheim) : elles prennent la zone de l'arrêt voisin. Diagnostic des va-et-vient (20 → 26/10, ordre suivi +3 à +13 km sur l'ordre calculé ; calcul d'ordre non lancé sur 4 tournées sur 6 récentes, cause à lire dans les journaux de l'Edge ; villages doublés Wingersheim / Mittelhausen / Hohatzenheim) : plan en attente de validation, rien d'autre changé.
- **Documents aligné sur la convention du Drive (PR #91, en cours, 27/10/2026)** : nom `[DATE_]TYPE_TIERS[_N°].ext` MAJUSCULES sans montant, dossier d'après le tableau de la convention (`_shared/conventionDocuments.ts`, copie exacte côté site), pièces sensibles non lues par l'IA, écrans simplifiés (carte compacte, « Tout ranger », « Trier »), case « Dis-moi ce que c'est » (phrase → nom + dossier, sans IA, souple : fautes, abréviations, verso / pages), origine du document (fiche salarié / véhicule / client, déposé par) et habitudes de rangement apprises des documents classés (dossier et type habituels d'un tiers, exemples dans le prompt IA), recherche, doublons ; Bibliothèque : renommage IA d'un fichier / d'un dossier déjà dans le Drive (Edge `drive-renommer-ia` **v1 déployée le 27/10/2026**, sans lecture IA pour les dossiers Sécurité / Direction / Social et RH) ; Edge `trier-documents` à redéployer au merge (utilise désormais `_shared/lectureDocument.ts`) ; détail `mca-spec/revue/09-documents.md` § 0. **Prochain gros chantier demandé : optimisation de trajet (va-et-vient dans les villages).**
- **Connexion refaite — MERGÉE le 26/10/2026 (PR #92, `fc90e0f`)** : `LoginPage.tsx` = UNE carte centrée, identique PC et mobile (logo, Google, e-mail, mot de passe avec œil, alerte majuscules, message d'erreur unique). Pas de panneau latéral, pas de routes animées, pas de champ piège (un gestionnaire de mots de passe le remplissait et bloquait l'envoi en silence). Les valeurs sont lues dans le formulaire à l'envoi (autofill). Bouton Google débloqué après 8 s ou au retour arrière. Pause navigateur après 5 échecs (`login.logic.ts`, `localStorage`), contournable : la vraie barrière est le verrou serveur (table `auth_echecs` + fonction `hook_password_verification_attempt`, migration `20261026090000` appliquée ; 5 échecs = 5 min, 10 = 30 min, 15 = 2 h). **Inerte tant que le hook n'est pas activé** : Supabase → Authentication → Hooks → « Password verification attempt » (à faire par l'utilisateur ; option : Captcha Turnstile dans Auth → Attack Protection). Un e-mail inconnu n'a pas de compte à verrouiller : seule la limite par IP de Supabase joue. Logs du 26/10 : 15 refus en 10 s sur la prod (mot de passe faux ou oublié), réinitialisation demandée.
- **Onglet Documents (Système › Documents) — MERGÉ le 24/10/2026 (PR #89, `bc657b7`)** : fiche `mca-spec/revue/09-documents.md` (écran, Edge, données, limites). Inbox → tri IA (`trier-documents` v4) → À confirmer (dossier du Drive à choisir) → rangé dans le Drive (`drive-ranger` v3, confirmation instantanée) → Historique ; Bibliothèque = Drive (`drive-browse` v14, `drive-fichier` v1). Feuilles de route / synthèses / preuves de tournée rangées d'après la tournée, sans IA. Migrations `20261024110000`, `…120000`, `…130000` appliquées ; toutes les Edge déployées. **À faire par l'utilisateur** : reconnecter Google (Paramètres, cocher Drive), choisir le dossier de rangement, tester sur de vrais fichiers. Reste : aperçu .docx / .xlsx dans l'appli, décider de la copie Storage après rangement. Suite des refontes : Système (Paramètres, Admins), Flotte, `<select>` natifs restants, code mort « journées colis » dans Mes courses.
- **Équipe allégée (24/10/2026, demande de l'utilisateur)** : onglets À valider, Journées, Rapports et Heures SUPPRIMÉS (code, alerte « journées à valider », droits `equipe.journees` / `equipe.heures` du catalogue, outil `get_heures` de l'assistant rendu muet) ; fiche membre sans Messagerie, Notes ni Documents (colonnes `tarif_*`, `clients_messagerie`, `notes`, tables `journees_colis*` / `work_hours` gardées en base, plus lues).
- **Tiers refondu (24/10/2026)** : Clients + Fournisseurs = tuiles cliquables (`ChiffreCarte`, comptent sur l'ensemble, pas sur la liste filtrée), barre de recherche, `ListeDeroulante`, pastilles de filtre à bascule (`PastilleFiltre`), lignes avec `AvatarInitiales`, « Tout réinitialiser » ; listes natives de la fiche client / fournisseur passées en `ListeDeroulante`. Équipe (Membres + filtres des journées) refait de même le 24/10/2026. Reste : Système, Flotte, autres `<select>` natifs.
- **Pennylane = source des montants (24/10/2026)** : plus de « Créer la charge » côté Justificatifs ; une facture supprimée chez Pennylane disparaît du site (charge + carburant / entretiens reliés) à la synchro, avec garde-fou anti-liste tronquée (`pennylane-sync` v23).
- **Lecture IA des tickets (23/10/2026)** : Edge `lire-ticket` v2 lit le ticket DÈS LE DÉPÔT (lancée par le salarié, une seule fois, `ocr_lu_le`) et préremplit montant / date / catégorie / fournisseur (cases vides seulement ; plus de TVA, Pennylane la lit) ; le bureau confirme, voir `mca-spec/revue/06-finance.md`. Envoi Pennylane = mail PDF (Edge `pennylane-justificatif` v12). Reste F2b (HT / TVA par ligne de ventilation).
- **Drive rétabli pour la Bibliothèque (24/10/2026, demande de l'utilisateur)** : un seul compte Google (contact@mcalogistics.fr) connecté dans Paramètres › « Compte Google (Gmail + Drive) » (`GmailConnect`, Edge `drive-oauth-start` v17 = scopes gmail.send + drive) ; Documents › Bibliothèque = le Drive uniquement (`drive-browse` v14 (arbre des dossiers), `drive-fichier` v1, `drive-rename`) ; un document confirmé est rangé par `drive-ranger` v3 (lots, confirmation instantanée côté écran) dans `<racine>/<chemin choisi à la confirmation>` (migration `20261024120000_documents_drive` appliquée). Écrans Drive d'avant (rapatriement, accès par compte) restent supprimés ; Edge `drive-*` d'ancien usage non appelées (`drive-list`, `drive-upload`, `drive-move`, `drive-delete`, `drive-create-folder`, `drive-migrate-to-storage`). Justificatifs validés → mail à `companies.pennylane_depot_email` (Edge `pennylane-justificatif` v12). Messages d'erreur de `send-client-email` citent encore « Drive » (à reformuler au prochain déploiement). **Reconnecter Google après déploiement** (ancien jeton = Gmail seul).
- **CHANTIER PRIORITAIRE — Uniformisation Pennylane ↔ site** (demandé le 02/10/2026) : plan
  `mca-spec/UNIFORMISATION-PENNYLANE.md` (écarts cités fichier:ligne, lots U1 → U8). Règle :
  une seule source par règle (`_shared/` + miroir front testé) ; tout document envoyé à
  Pennylane (client, devis, facture, avoir, paiement, charges) suit les mêmes règles que le
  site. Ordre : U1 droits des 5 synchros · U2 client Pennylane unique (pays, TVA, SIREN, local
  gagne) · U3 lignes du devis = lignes de facture · U4 devis converti suivi (choix d'archi à
  valider) · U5 dates Paris + paiements réels · U6 mentions légales (= lot E) · U7 charges ·
  U8 ménage. Lot par lot (migrations / Edge appliquées par Claude, voir § 9).
  - **U1 codé (PR #41)** : `exigerPermission` + société de l'appelant dans pennylane-clients-sync
    (tiers.clients/update), pennylane-sync (finance.charges/update), pennylane-payment-check et
    qonto-sync (finance.tresorerie/update), pennylane-file (finance.charges | flotte.carburant |
    flotte.entretiens / view + facture rattachée à une charge de la société) ; front :
    `autoSync#DROIT_SYNC` filtre les synchros lancées. **Mergé (PR #41) et déployé le
    03/10/2026** (qonto-sync v17, pennylane-file v2, pennylane-payment-check v20,
    pennylane-clients-sync v16, pennylane-sync v20). Les paquets déployés ne contiennent que
    les parties de `_shared` réellement importées (comportement identique).
  - **U2 fait** : `_shared/clientPennylane.ts` (pur, testé) = règle unique du client Pennylane
    (`payloadClientPennylane` : pays + n° TVA ; `ligneClientSync` : le site gagne, SIREN dans
    `clients.siren`, un « siret » de 9 chiffres y est rangé, archivé reste archivé) ;
    `_shared/pennylane#assurerClientPennylane` pour pennylane-invoice ET pennylane-quote ; facture
    autoliquidée sans n° TVA client refusée ; fiche client : champ SIREN séparé du SIRET.
    Migration `20261003090000_clients_siren` appliquée ; **mergé (PR #42) et déployé le
    03/10/2026** (pennylane-clients-sync v17, pennylane-quote v14, pennylane-invoice v35).
    Données : 0 « siret » à 9 chiffres, 10 SIREN.
  - **U3 fait** : `_shared/lignesFacture#construireLignesDevis` (même assembleur que la facture :
    quantité × PU, suppléments, autoliquidation `exempt` + mention, réf. client) ; pennylane-quote
    lit la fiche de prix et refuse l'autoliquidation sans n° TVA ; front : règles de base dans
    `shared/lib/lignesPennylane.ts` (aperçu facture + devis), `montantsDevis` = TVA ligne par
    ligne. Sans migration. **Mergé (PR #44) et déployé le 03/10/2026** (pennylane-quote v15,
    pennylane-invoice v36).
  - **U4 fait (option A validée)** : « Facturer directement » sur un devis accepté crée la course
    `livree` (`devis.logic#versLivraisonFacturable`, `quote_id`, `justif_non_requis`) puis la
    facture par `shared/lib/facturation.queries#facturerCourse` (même code que Livraisons) ;
    pennylane-invoice passe le devis `accepte` → `facture` (seul écrivain) ; pennylane-quote
    `convert` refusée (410), verrou d'envoi `quotes.envoi_verrou`, refus dans `quotes.sync_error`
    (affiché sur le devis). Migration `20261003120000_quotes_envoi_verrou` appliquée ; **mergé
    (PR #46) et déployé le 03/10/2026** (pennylane-quote v16, pennylane-invoice v37). Limite :
    chez Pennylane le devis n'est pas relié à la facture.
  - **U5 fait** : `_shared/dates.ts` (jour / année à Paris, testés) dans pennylane-invoice,
    register-payment, payment-check, last-numbers ; payment-check : `paid_at` = date de la
    transaction rapprochée chez Pennylane, avoir → `annulee` + trace `sync_error` ;
    `_shared/totaux#totalTtcCourseCts` = miroir testé de `deliveryTotalTtcCts`. Sans migration.
    **Mergé (PR #47) et déployé le 03/10/2026** (invoice v38, register-payment v3,
    payment-check v21, last-numbers v3 ; paquets réduits aux parties de `_shared` importées).
    Reste : saisir à la main la date réelle d'un paiement (le front pose « maintenant »).
  - **Prochain lot Pennylane : U6** (mentions légales), puis U7, U8 (reprise après la revue
    Tournées, terminée le 06/10/2026).
- **Audit du 01/10/2026** : `mca-spec/AUDIT-2026-10-01.md` (manques et bugs par section,
  classés bloquant / important). À relire avant de toucher Tiers, Finance, Flotte.
- **Lots fiche livraison** (`mca-spec/revue/03b-fiche-livraison.md`) : B fait (fiche client) ·
  C échecs & annulation
  (relivrer, retour dépôt, avoir) · D tournées de colis (import, scan, LV de tournée) · E facture
  conforme (indexation gazole, pays client, CMR).
- Dashboard : compter les **colis** de messagerie (aujourd'hui un relevé = 1 livraison dans les
  compteurs ; le CA est juste).
- Devis : PR #41 (D1 + D2 + uniformisation avec la fiche livraison + recherche / filtres de la
  liste). Migration `20261002090000_quotes_fiche_prix` **appliquée en prod le 02/10/2026**. D3 = lot U3 (fait, 03/10/2026) ; D4 reste :
  expiration automatique, relance des devis envoyés > 7 j.
- ~20 fiches clients « particuliers » jetables (anciennes courses de plateformes) : fusionner
  ou désactiver ? (à décider)
- 1 client au délai 60 j (non conforme) : le repasser à 30 j dans sa fiche.
- Correctif global `text-[var(--fs-*)]` : PR dédiée à décider.
- Chauffeur : supprimer ses propres photos dans l'heure ? (question ouverte)
- **Dépenses véhicule** (Carburant + Entretiens) : plan `mca-spec/tabs/30-depenses-vehicule.md`
  à lire AVANT d'y toucher ; étapes 0-1 faites, étape 2 (table unifiée) attend le « go ».
  Pas d'immobilisation ni de prorata km dans ces écrans.
- Planning : changer chauffeur / jour détache la course de sa tournée (choix à confirmer).
- **Revue 04a Tournées** (`mca-spec/revue/04a-tournees.md`, 04/10/2026) : lots T1 → T5.
  **T1 fait** (PR #49, déployé : optimize-tours v20 avec `exigerPermission(planning.tournees/
  update)` + société de l'appelant ; optimize-tour v13 = 410) : « mon ordre » écrit
  `driver_id` / `vehicle_id`, affectations reprises, confirmation avant écrasement. Décision :
  temps d'arrêt **5 min par livraison** (T3). **T2 fait** (PR #50, mergé, sans migration ni
  Edge) : retirer une course, supprimer une tournée, badge « Tournée X », documents échus.
  **T3 + T4 + T5 faits** (PR #51, mergé et déployé le 06/10/2026 : migration
  `20261004090000_tours_depart_demarrage` appliquée, optimize-tours v21) : départ choisi
  (`tours.heure_depart`), 5 min / arrêt, créneaux, urgent, `tours.started_at` (trigger
  `tours_started_at`), carburant inventé retiré, retraits en paires (géocodés à la volée par
  optimize-tours, sans colonne), écran 2 colonnes. Revue Tournées terminée.
  Piège MCP : `apply_migration` expire sur plusieurs instructions groupées ou un corps `$$` →
  appliquer instruction par instruction (corps de fonction entre apostrophes).
- **Espace salarié** (demandé le 12/10/2026, PRIORITAIRE) : plan `mca-spec/PLAN-ESPACE-SALARIE.md`
  (heures saisies par le salarié, journée messagerie colis domicile / relais + photo,
  validation bureau avec verrou, rapports jour / mois / salarié, relevé client déduit, ticket →
  Pennylane). Décisions du 12/10 en § 0 du plan (heures retirées : LIC papier ; tarifs domicile
  et relais ; litige + raison ; validation admin + double confirmation + historique). Lots S0
  → S4. **S0 codé (PR #52)** : cloisonnement du salarié (migration
  `20261012090000_salarie_cloisonnement` : toute la finance était lisible par tout compte) +
  « Accès au site » dans la fiche Équipe (Edge `admin-users`). Règle : toute nouvelle table
  reçoit sa policy salarié. **Migration S0 appliquée le 12/10/2026** (vérifié en simulant le
  compte chauffeur de Lucas : 0 charge / 0 fiche lue ; président inchangé).
  **S0-bis (PR #52, audit de 3 agents)** : migration `20261012100000_salarie_terrain` (écritures
  terrain du salarié sur SES courses / SA tournée bornées par triggers, compte désactivé =
  `current_company_id()` null, Qonto / produits véhicule fermés, profile_id unique, FK SET NULL),
  Edge avec contrôle de droit (admin-users, drive-*, geocode, lire-facture, lire-releve,
  suggest-categorie-ia, send-client-email, pennylane-last-numbers), Mes courses corrigé (faux
  « enregistré », créneaux, compteurs, SMS, itinéraire), cadre chauffeur épuré, Accès au site
  complet, Équipe / Heures corrigés. Restent : montants lisibles par le salarié sur ses courses
  (vue dédiée à faire), Edge ai-extract-deliveries / assistant-chat / alertes-briefing /
  brouillons-generate / route-calc / drive-status sans contrôle de droit, colonne
  `work_hours.total_minutes` fausse sur une nuit. **Migration appliquée le 14/10/2026.**
  **S1 (PR #52, 13/10/2026)** : migration `20261012110000_journees_colis_depenses` (tarifs domicile /
  relais + clients de messagerie dans la fiche, `journees_colis` + historique, garde : validée =
  verrouillée, motif obligatoire pour la toucher, photos `entity_type = 'journee_colis'`, dépenses
  enrichies dans `receipts_inbox`) ; droit `equipe.journees`. Salarié (Mes courses, 4 onglets) :
  Courses · Ma journée (+ Mon mois, paie estimée ; **« Ma journée » supprimée le 19/10**) · Dépenses (photo vérifiable, carte société /
  note de frais, suivi) · Moi. Bureau : Équipe › À valider / Journées / Rapports (+ CSV), fiche
  Messagerie, justificatifs enrichis dans Charges, cloche. Reste : téléphone de la société pour
  « Appeler le bureau » ; « Créer la charge » ne reprend pas encore montant / note de frais ;
  clôture du mois ; dépense → Pennylane (S3). **Migration appliquée, PR #52 mergée et Edge
  déployées le 14/10/2026** (admin-users v10, drive-connect v10, drive-disconnect v2,
  drive-oauth-start v13, drive-oauth-callback v11 `verify_jwt=false`, geocode v6,
  send-client-email v5, suggest-categorie-ia v4, lire-facture v8, lire-releve v2,
  pennylane-last-numbers v4). Note : geocode avec `address` reste ouvert sans session (simple
  lecture IGN, aucune écriture) ; seul le `backfill` exige le droit.
  À tester : lier Lucas à sa fiche (Accès au site), lui donner le client de messagerie + tarifs
  domicile / relais, saisir une journée avec photo, la valider côté bureau.
  Piège : `id = any((select f()))` est refusé par Postgres (sous-requête) → `(select f()) @> array[id]` ;
  remplacer une policy = `alter policy` (pas de drop + create : trou d'accès et timeout MCP).
- **Tournée de colis** : TC1 « socle » **mergé (PR #55, 18/10/2026)**, migration
  `20261017090000_tournees_colis` + Edge `lire-feuille-route` en prod. Familles de statut
  validées le 18/10/2026 (outil des livreurs) : livré = livre, rc_remis, col_ok · attente =
  avise, instance · retour = refuse, npai, adresse, acces, endommage, nonpres, rc_ferme,
  rc_sature, col_nf · neutre = col_rien.
  **Lots 2 à 5 mergés (PR #56)**. **PR #58 mergée le 18/10/2026** (ergonomie une main : barre
  du prochain arrêt, gros boutons, annulation 8 s, code couleur classique bleu / relais violet /
  collecte jaune, avancement par catégorie ; relais revérifiés sur localiser.laposte.fr le
  18/10/2026 : Mommenheim 37 rte de Brumath, Geudertheim 52 rue du Gal de Gaulle + 1 rue de
  l'Industrie, Kriegsheim 13 Grand'Rue, Bernolsheim 4C rue de Lisbonne (+ Super U, route de
  Brumath, sans numéro : non ajouté ; 2A rue Principale vient de l'ancien outil, non retrouvé
  sur La Poste), Brumath 141 av. de Strasbourg + 4A rue des Carrières, Mittelschaeffolsheim 1 ter
  rue de Mittelhausen ; aucun relais Pickup trouvé pour Berstheim, Bilwisheim, Donnenheim,
  Hochstett, Krautwiller, Wittersheim, Waltenheim-sur-Zorn ; Wingersheim = agence communale en
  mairie) : départ fixe (centre de tri de Vendenheim, migration
  `20261018100000_companies_depart_colis`, optimiser-tournee-colis v3) + scan v2 (migration
  `20261018110000_referentiel_tournees_colis` appliquée et base chargée : 700 rues, 9 985
  numéros ; lire-feuille-route v3 déployée). Piège : `apply_migration` / `execute_sql` sur
  un gros paquet de données = découper en blocs de ~15 Ko (coordonnées en écarts entiers).
  Lots 2 à 5 (PR #56, squash 9a212bf, 18/10/2026) :
  migration `20261018090000_tournees_colis_route` **appliquée le 18/10/2026** (ordre / eta /
  trajet / clôture, `positions_livreurs`, photos `arret_colis`) ; Edge
  `optimiser-tournee-colis` **v2** et `lire-feuille-route` v2 **déployées le 18/10/2026**.
  Calcul : ORDRE sur les temps de route réels (matrice ORS, vérifié sur une vraie tournée de
  106 arrêts : 106 km contre 151 km dans l'ordre de la feuille) + recherche locale itérée
  (~0,8 s) ; TRACÉ par l'itinéraire IGN (sans clé, 15 étapes max par appel → tronçons de
  17 points), ORS en secours, ligne droite seulement pour un tronçon qui échoue (la v1
  traçait par ORS, qui échouait : carte en lignes droites alors que l'ordre était juste). Front :
  `shared/lib/tourneesColisRoute.ts` (règles pures), `shared/ui/CarteTournee.tsx` (Leaflet,
  Plan IGN), `mescourses/MaTournee.tsx` + `ArretTournee.tsx`, `tournees/TourneesColisDuJour.tsx`,
  `livraisons/ColisDesJournees.tsx`. Départ des tournées de colis : **centre de tri La Poste de
  Vendenheim** (EcoParc Rhénan, décidé le 18/10/2026), réglé dans Paramètres › Société
  (`companies.depart_colis_*`, migration `20261018100000_companies_depart_colis` appliquée, Edge
  v3) ; repli : adresse du remettant, puis dépôt. À valider : temps par arrêt (2 min,
  `_shared/tourneeRoute#ARRET_S`),
  partage de position (prévenir les salariés : information CNIL / affichage).
  **Plus court par la route (19/10/2026)** : le solveur minimise la DISTANCE routière (`matriceCouts` = mètres + 0,05·secondes en départage) et non plus le temps, + polissage exact par fenêtres de 10 arrêts (`polirParFenetres`) ; sur la vraie tournée de 68 arrêts (matrice OSRM) 69,7 → 67,5 km. optimiser-tournee-colis **v4 déployée** ; il faut « Recalculer » une tournée déjà calculée. **Quota ORS (19/10/2026)** : l'ancienne adresse api.openrouteservice.org est dépréciée (quota réduit à 10 % depuis le 27/08/2026, fermeture début 11/2026) → l'Edge (v8) utilise api.heigit.org/openrouteservice/v2, même clé. L'optimisation (Vroom) n'existe PAS sur api.heigit.org (vérifié le 19/10/2026) : remplacée le 20/10/2026 pour optimize-tours (voir Tournées). Qualité du solveur validée le 19/10/2026 contre OR-Tools (60 s, routes OSRM) : 62 357 m contre 62 356 m (tournée 7832ca6d), 67 478 m contre 67 532 m. « 403 Quota exceeded » = limite du jour ; plus AUCUN secours (décision du 19/10) : ni vol d'oiseau, ni tracé ORS, ni ligne droite ; l'Edge (v9) répond une erreur claire (limite du jour, ORS ou IGN indisponible) et laisse l'ordre actuel intact. **Village par village (décision du 19/10/2026)** : chaque village en UN seul bloc (`penaliserChangementsVillage`, +1 000 km par changement de village dans le coût ; `tournees_colis_arrets.commune` lu par l'Edge v11) ; vraie tournée 7832ca6d : 63,8 km village par village contre 62,4 km sans contrainte (Geudertheim coupé en deux), OR-Tools ne fait pas mieux. Le calcul de l'ordre est lancé AUTOMATIQUEMENT à la création d'une tournée scannée (`ScanFeuilleRoute`, 19/10/2026) ; Edge v10 : message distinct « limite du jour » (403 + quota) / « accès refusé » (autre 403). Quota ORS (compte HeiGIT) : matrice 500 / jour (4 requêtes par calcul de 68 arrêts, 1 si ≤ 59 points). Les trous de la matrice ORS (point sans route) restent bouchés par le vol d'oiseau (`completerMatrices`).
  **Horaires des relais La Poste (19/10/2026)** : Edge `horaires-relais-poste` v1 (open data La Poste, jeu `laposte-ouvertur` sur data.laposte.fr/data-fair, sans clé, quotidien) → ligne « Ouvert jusqu'à 12 h / Fermé · ouvre à 15 h » (`mescourses/HorairesRelais.tsx`, `shared/lib/relaisPoste.ts`) sur les arrêts relais / collecte dont l'adresse est un point La Poste : Geudertheim 52 rue du Gal de Gaulle (12532A), Mommenheim 37 route de Brumath (12585A), Wingersheim mairie (12692A), Brumath bureau (12494A). Les relais « Pickup » (Kriegsheim, Bernolsheim, Geudertheim rue de l'Industrie…) ne sont PAS dans cette base : aucun horaire, rien d'affiché. L'ordre du trajet ne tient pas compte des horaires (affichage seulement, décision du 19/10).
  **Mes courses › Dépenses / Moi (19/10/2026)** : note OBLIGATOIRE, plus de catégorie côté salarié (le bureau la choisit) ; Moi sans « Mon véhicule », sans « L'appli sur ton téléphone », sans « Se déconnecter » (bouton du haut) ; « Mes documents » : envoi d'un document au bureau (`documents` entity_type `team_member` sur SA fiche, migration `20261019100000_documents_salarie_ma_fiche`, appliquée). « Y aller » : Google Maps par défaut (`prefChauffeur#APP_NAV_DEFAUT`, décision du 19/10), choix Google Maps / Waze / Plans dans Moi › Navigation (par téléphone).
  **Ma tournée à la main + lecture en arrière-plan (19/10/2026)** : bandeau du haut collé (arrêts, km, boutons avec nom : Liste / Carte / Recalculer / Par la fin / Depuis ici / Partager). « Commencer par la fin » inverse tout ce qui reste ; flèches par village (en premier / monter / descendre) ; tout ordre changé à la main (glisser, village, inversion) relance l'Edge `optimiser-tournee-colis` en mode **`suivre`** (v12 : ordre gardé, seuls km / durée / heures / tracé refaits par ORS directions + IGN, sans matrice). « Recalculer » (ex-« Réinitialiser ») = recalcul complet (confirmation si ordre manuel) ; plus de « Ordre habituel » / « Ordre calculé ». **Scan serveur** (les photos partent UNE PAR UNE dès qu'elles sont prises, scan `brouillon` ; « Lire » = petite requête `keepalive` qui lance l'Edge puis on peut tout quitter ; avant ça, fermer la page pendant l'envoi des photos perdait le scan) : tables `scans_feuille_route` + `scans_feuille_route_pages` (migration `20261019110000`, appliquée), Edge `scanner-feuille-route` v3 (lit les pages avec `EdgeRuntime.waitUntil`, reprise si `battement` > 90 s) + `_shared/lireFeuilleCore.ts` (lecture d'une page, partagée avec `lire-feuille-route` v7) ; le front envoie les photos puis suit l'avancement ; au retour (autre onglet, site rouvert) `trouverScan` ramène le scan (carte dans Aujourd'hui, pastille sur Ma tournée). La tournée n'est créée qu'au clic « Créer la tournée » (photos effacées).
  Piège Leaflet : `keyboard={false}` sur la carte (sinon le toucher fait sauter la page et la
  pastille n'est plus sous le doigt) ; `isolate` sur le conteneur (sinon la carte passe sur
  l'en-tête collant).
  Banc de captures : Playwright + `page.route` sur une base simulée (aucun appel prod).
- **À décider (22/10/2026)** : ordre des villages d'après l'onglet « Villages » de `Tournée Brumath et villages 23.xlsx` (non fait) ; tournée Brumath du jour : 19 arrêts sur rues coupées entre zones sans zone tant que la feuille n'est pas relue ; frontières de zones « aux routes près » impossibles (non publiées). **Lecture IA** : Mistral gratuit reste en place ; passer à Claude coûterait ~2-3 $/mois avec Haiku 5.5 (~30-40 $ avec Sonnet 5.5) pour ~780 photos/mois, estimation non mesurée → essai comparatif Mistral / Haiku / Sonnet sur la feuille de Brumath proposé, nécessite une clé API Anthropic (plafond 5 $/mois) ; rien changé.
- U6 : décisions du 12/10/2026 = pénalités **taux BCE + 10 points**, **pas d'escompte** ;
  pied Pennylane (pénalités / 40 €) vérifié par l'utilisateur ; manque la **part du gazole (%)**.
- Refonte par onglet (22/10/2026) : plan et décisions dans `mca-spec/DECISIONS-2026-10-22.md`. Faits : zoom, Mes courses
  retiré du menu bureau, Flotte allégée, Pilotage, fond / cadre, Livraisons (Modèles + LV retirés, tuiles fusionnées,
  Preuves sur une page, Devis harmonisé). Planning / Tournées : fait le 22/10/2026 (voir § 11). Finance lot F1 (`mca-spec/revue/06-finance.md`) : Encaissement + Relances retirés, Trésorerie lecture seule, Charges par mois en HT ; F2a fait (onglet Justificatifs, moyen de paiement obligatoire, `receipts_inbox.rembourse_le`, charge « passée en OD ») ; reste F2b (HT / TVA par ligne de ventilation, IA) et le transfert Pennylane. Reste aussi : Équipe, Tiers, Système, reste de Flotte. Edge `send-client-email` (v6), `assistant-chat` (v26) et `optimize-tours` (v23) déployées le 22/10/2026.

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
