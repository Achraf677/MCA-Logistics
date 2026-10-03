# Uniformisation site ↔ Pennylane

> Inventaire du 02/10/2026 (lecture du code, rien de modifié). Fait foi jusqu'au lot U1.
> À relire avant de toucher une Edge `pennylane-*`, `_shared/pennylane.ts`, `_shared/lignesFacture.ts`.

## 1. Objectif
- Tout document envoyé à Pennylane (client, facture, devis, avoir, paiement) suit les MÊMES règles
  que le site : mêmes lignes, mêmes libellés, mêmes taux, même pays / TVA, mêmes échéances.
- Tout ce qui revient de Pennylane (clients, factures fournisseurs, paiements, avoirs) respecte les
  saisies locales et la machine à états.
- Toute Edge qui touche Pennylane contrôle l'appelant (société + droit).

## 2. Règle d'or
- **Une règle = un module `_shared/` pur** (sans Deno.env, testable par vitest) + **un miroir front
  testé contre lui** (modèle existant : `_shared/lignesFacture.ts` ↔
  `src/features/livraisons/apercuFacture.logic.ts`, test de parité `_shared/lignesFacture.test.ts`).
- Les Edge n'assemblent rien elles-mêmes : client Pennylane, lignes, dates, échéance, statut
  retour passent par le module commun.
- Un seul point d'accès à l'API : `_shared/pennylane.ts` (base, token, en-têtes 2026).
- Un seul contrôle d'accès : `_shared/auth.ts` (`exigerPermission` ou `lireAppelant` + `aLaPermission`).
- Modifier un `_shared` = redéployer toutes les Edge qui l'importent
  (`grep -rl "_shared/<fichier>" supabase/functions`).

## 3. Écarts constatés

### 3.1 Client Pennylane (création / mise à jour)
- `pennylane-quote/index.ts:107` : lit `clients` SANS `pays` ni `tva_intra` ; `:127` force
  `country_alpha2: 'FR'` ; aucun `vat_number`. `pennylane-invoice/index.ts:230,272,274` lit et
  envoie les deux. Un client UE créé par un devis est faux chez Pennylane — **bloquant**.
- `pennylane-quote` ne met jamais à jour le n° TVA d'un client existant ; `pennylane-invoice:276-287`
  ne le fait qu'en autoliquidation (best-effort) — **important**.
- Aucune Edge ne pousse les changements locaux (adresse, pays, e-mail) d'un client déjà créé :
  la fiche Pennylane reste figée à la 1re création — **important**.
- Bloc « trouver ou créer le client » copié deux fois (`pennylane-invoice:258-287`,
  `pennylane-quote:114-137`), avec gestion d'erreur différente (invoice ignore l'échec d'écriture
  de `pennylane_id`, quote le logue) — **important** (source de dérive).
- `pennylane-clients-sync/index.ts:132` : `siret: c.reg_no` (SIREN 9 chiffres) alors que la fiche
  exige 14 chiffres (`src/features/clients/DrawerClient.tsx:122`, `clients.logic.ts:40`) → fiche
  inenregistrable — **bloquant**.
- `pennylane-clients-sync:130,132,133` : écrase `name`, `siret`, `tva_intra` locaux à chaque synchro
  (seuls email / téléphone / adresse / ville / CP suivent « local gagne », `_shared/clientSyncMerge.ts`)
  — **bloquant**.
- `pennylane-clients-sync:144` : `active: true` réactive les clients archivés — **bloquant**.
- `pennylane-clients-sync` n'importe pas `billing_address.country_alpha2` (type lu `:20`, jamais
  écrit) : `clients.pays` reste FR pour un client UE créé chez Pennylane — **important**.
- `pennylane-clients-sync:176` renvoie `_debug_first_customer` (données brutes) à tout appelant — **important**.
- Délai de paiement : jamais envoyé au client Pennylane (seule l'échéance de facture l'est) — **confort**.

### 3.2 Lignes de facture / devis
- Facture : `construireLignes` (`_shared/lignesFacture.ts:135-206`) → libellé `libelleCourse`
  (`:107-118`, réf. client, messagerie « Messagerie <mois> — colis livrés »), quantité colis
  (`quantiteColis :97-105`), suppléments, codes TVA légaux (`:13-25`), autoliquidation = code
  `VAT_CODE_AUTOLIQUIDATION` + mention dans le libellé (`_shared/pennylane.ts:58-70`).
- Devis : `pennylane-quote/index.ts:140-146` = UNE ligne `quantity: 1`, HT total, libellé
  = description ou « Devis du <date> » — **bloquant** pour un devis au colis / avec suppléments.
- Devis : `:77` ne lit pas les colonnes de la fiche de prix (`prestation, unite, quantite,
  prix_unitaire_cts, extra_lines, reference_client, autoliquidation`, migration
  `20261002090000_quotes_fiche_prix.sql`, non appliquée) — **bloquant** (le client reçoit un devis
  différent de l'écran).
- Devis autoliquidé : `tva_cts = 0` → taux effectif 0 (`:94`) → code `FR_000`, pas `exempt`, et
  aucune mention art. 259-1 — **bloquant** (non conforme).
- Devis : taux effectif calculé à la main (`:92-95`) au lieu de `tauxLignePrincipale` ; suppléments
  à un autre taux fondus dans un taux moyen → refus « taux non standard » ou mauvais code — **important**.
- Devis → facture : `createInvoiceFromQuote` (`_shared/pennylane.ts:233-240`) recopie les lignes du
  devis ; si le devis est bancal, la facture l'est aussi — **bloquant** (dépend du point précédent).
- Front devis : `devis.logic.ts:88-100` (`montantsDevis`, TVA sur le HT total) n'est pas le miroir
  de `construireLignes` (TVA ligne par ligne, Pennylane arrondit par ligne) — **important**.

### 3.3 Dates, échéances, numéros
- Facture : date du jour à Paris (`pennylane-invoice:293`) ; échéance `echeanceTransport`
  plafonnée 30 j (`:297-306`, `_shared/paymentTerms.ts:234-240`) — référence.
- Devis : `deadline = valid_until` sinon date + 30 j (`pennylane-quote:149-155`), en UTC mais sur
  date seule (sans risque de veille). Pas de plafond : normal pour une validité, mais la facture
  issue de `convert` ne reçoit AUCUNE date ni échéance du site → échéance ≤ 30 j non garantie
  — **important** (à vérifier sur une vraie conversion).
- Paiement : `pennylane-register-payment:158-159` date = `paid_at.slice(0,10)` d'un horodatage UTC
  posé par le front (`livraisons.queries.ts:186,189` = `new Date().toISOString()`) → veille entre
  0 h et 2 h, et toujours « maintenant », jamais la date réelle — **important**.
- `pennylane-payment-check:299` : `paid_at = now()` au lieu de la date du paiement Pennylane — **important**.
- `pennylane-last-numbers:265` : année `new Date().getFullYear()` en UTC (31/12 → 1/1) — **confort**.
- Numéros : facture lue après finalisation + contrôle de doublon (`pennylane-invoice:325,355-369`) ;
  devis lu à la création + rattrapage `sync-number` — cohérent.

### 3.4 Statuts écrits en retour, verrous, erreurs
- `facturee` : écrit par `pennylane-invoice:374-384` (verrou `facturation_verrou :205-225`,
  `sync_error`, codes `brouillon_non_finalise` / `enregistrement_echoue`) — référence.
- Devis `envoye` / `facture` : écrits par `pennylane-quote:171,250` SANS verrou (double clic =
  2 devis / 2 factures possibles) ni `sync_error` — **important**.
- `DrawerDevis.tsx:332` réécrit `statut = 'facture'` après l'Edge (double écrivain) — **confort**.
- Facture issue d'un devis : liée à `quotes.pennylane_invoice_id` seulement ; aucune `deliveries`
  → hors encours, relances, `pennylane-payment-check`, jamais `payee` ; et la course créée par
  « Transformer » peut être refacturée — **bloquant** (double facturation possible).
- `pennylane-payment-check:279-284` : `facturee → annulee` sans trace (`sync_error` / note) ;
  transition système documentée (CLAUDE.md § 6) mais à centraliser — **important**.
- `pennylane-register-payment:36-55` : `ttcCourseCts` réécrit le TTC à la main ; miroir NON testé de
  `deliveryTotalTtcCts` (`src/shared/lib/money.ts:114`) — **important**.
- Messages d'erreur : `pennylane-invoice` a `detailPennylane` (`:34-46`) ; les autres Edge renvoient
  `err.message` brut — **confort**.

### 3.5 Contrôle d'accès
- Avec contrôle : `pennylane-invoice:99`, `pennylane-register-payment:73` (`exigerPermission`),
  `pennylane-quote:54-62` (`lireAppelant` + `aLaPermission`), `pennylane-last-numbers:255`
  (session seule), `send-client-email:143-175` (contrôle maison).
- SANS contrôle : `pennylane-clients-sync:49-63`, `pennylane-sync:91-105`,
  `pennylane-payment-check:235-242`, `qonto-sync:11-31`, `pennylane-file:291-308` — n'importe quel
  compte connecté (chauffeur) les déclenche ; toutes prennent `companies.limit(1)` au lieu de la
  société de l'appelant — **bloquant**.
- Deux helpers d'auth concurrents dans `_shared/auth.ts` (`:29-81` et `:110-153`) — **confort**.
- `send-client-email:34,192-195` redéclare `PENNYLANE_BASE`, lit le token et les en-têtes 2026 à la
  main (contourne `_shared/pennylane.ts:8-25`) — **confort**.

### 3.6 Mentions légales et libellés
- Aucune mention pénalités de retard, indemnité forfaitaire 40 €, indexation gazole (L3222-1/2)
  dans le code (grep vide) : dépend des réglages Pennylane — **important** (lot E déjà prévu).
- Mention autoliquidation : constante dupliquée `_shared/pennylane.ts:69` ↔
  `apercuFacture.logic.ts:26` (testée par la parité) ; absente des devis — voir 3.2.
- Libellé par défaut : facture « Livraison <type> du <date> » ; devis « Devis du <date> » ;
  messagerie « Messagerie <mois> — colis livrés » sur facture seulement — **important**.

### 3.7 Fournisseurs / charges (`pennylane-sync`, lecture seule)
- Gardé : n°, date, libellé, HT / TVA / TTC, fournisseur (nom, `establishment_no` → `siret`, TVA),
  lien PDF ; adoption des charges saisies à la main (`:209-292`) ; suppression signalée (`:313-341`).
- Perdu : lignes de facture (taux par ligne, catégories), échéance, état payé / reste dû,
  adresse / IBAN fournisseur, devise.
- `snapVatRate` (`:59-73`) cale sur {0 ; 5,5 ; 10 ; 19 ; 20} ±1,5 → 19 % non légal FR, 2,1 % absent ;
  ≠ `codeTvaLegal` (`lignesFacture.ts:13-19`) — **important**.
- Upsert (`:295-298`) réécrit date / libellé / montants / taux à chaque synchro et upsert fournisseurs
  (`:149-160`) réécrit nom / SIRET / TVA : pas de « local gagne » — **important**.
- `receipt_url` stocke `public_file_url` qui expire (`:201`) ; à lire via `pennylane-file` /
  `urlFraichePennylane` — **confort**.
- Incohérence d'identifiant : fournisseurs `siret ← establishment_no` (`:153`), clients
  `siret ← reg_no` (SIREN) (`pennylane-clients-sync:132`) — voir U2.

## 4. Plan en lots

### U1 — Contrôle d'accès des synchros (sécurité, sans migration) — ✔ FAIT (PR #41, déployé le 03/10/2026)
- Fichiers : `pennylane-clients-sync`, `pennylane-sync`, `pennylane-payment-check`, `qonto-sync`,
  `pennylane-file` (index.ts) ; `exigerPermission(req, svc, '<ressource>', 'update'|'view')` ;
  société = celle de l'appelant (plus de `companies.limit(1)`) ; retirer `_debug_first_customer`.
- Front : masquer les boutons / déclencheurs `SyncProvider.tsx:54-57` sans le droit.
- Migration : non. Edge : les 5. Tests : chauffeur → 403, président → 200 (manuel, preview).
- Ordre : merge front → déploiement des 5 Edge (`verify_jwt` inchangé).

### U2 — Client Pennylane unique (`_shared/clientPennylane.ts`) — ✔ FAIT (PR #42 + correctif, migration `clients_siren` appliquée, Edge déployées le 03/10/2026 : clients-sync v17, quote v14, invoice v35)
- Réalisé : `payloadClientPennylane` + `ligneClientSync` (pur, testé) ; `_shared/pennylane#assurerClientPennylane`
  (facture ET devis) ; facture autoliquidée sans n° TVA refusée ; `clientSyncMerge` supprimé ; un
  « siret » local de 9 chiffres (ancienne synchro) est rangé en `siren`. Plan d'origine ci-dessous.
- `clientPennylane.ts` pur : `payloadClient(client)` (nom, e-mails, `external_reference`, adresse,
  `country_alpha2` validé, `vat_number` normalisé, SIREN séparé) + `assurerClientPennylane(token,
  supabase, client, {autoliq})` (trouver / créer / mettre à jour TVA, écrire `pennylane_id`).
- `pennylane-invoice` et `pennylane-quote` l'appellent (lire `pays`, `tva_intra` dans le devis).
- `pennylane-clients-sync` : `reg_no` → nouvelle colonne `clients.siren` (jamais `siret`) ;
  `name / siret / tva_intra` en « local gagne » (étendre `clientSyncMerge.ts` + miroir
  `src/shared/lib/clientSyncMerge.ts`) ; ne plus forcer `active: true` à l'update ; importer
  `country_alpha2` si `pays` vide.
- Migration : oui (`clients.siren text null`, additive ; aucune migration ne la crée à ce jour,
  vérifier `information_schema.columns` avant).
- Edge : invoice, quote, clients-sync. Tests : `clientPennylane.test.ts` (FR / UE / sans TVA),
  `clientSyncMerge` (local gagne sur nom / TVA, archivé reste archivé).
- Ordre : migration → merge → 3 Edge.

### U3 — Lignes du devis = lignes de la facture — ✔ FAIT (PR #44, déployé le 03/10/2026 : pennylane-quote v15, pennylane-invoice v36)
- Réalisé : `_shared/lignesFacture#construireLignesDevis` (même assembleur que `construireLignes` :
  quantité × PU, suppléments, codes légaux, autoliquidation `exempt` + mention, refus lisibles ;
  ancien devis = 1 × (HT − suppléments)) ; `libelleDevis` (= `libelleCourse`, messagerie
  « Messagerie — prix au colis ») ; `pennylane-quote` lit la fiche de prix, refuse un devis
  autoliquidé sans n° TVA client ; front : `shared/lib/lignesPennylane.ts` (règles de base
  sorties de l'aperçu facture + `lignesDevis`), `montantsDevis` = TVA ligne par ligne + blocage
  dans « Il manque » ; parité Edge ↔ front dans `lignesFacture.test.ts`. Migration : aucune
  (colonnes déjà en prod, vérifié le 03/10/2026). Plan d'origine ci-dessous.
- `_shared/lignesFacture.ts` : `construireLignes` accepte une source générique (course OU devis) :
  devis → `quantity = quantite`, `amountHtCts = prix_unitaire_cts`, mêmes suppléments, même
  autoliquidation (code + mention), même libellé (`libelleCourse` avec prestation + réf. client).
- `pennylane-quote` : lit les colonnes de la fiche de prix, appelle le builder ; ancien devis
  (colonnes nulles) = repli 1 × HT (comme `ligneDepuisAncien`, `devis.logic.ts:112`).
- Front : `devis.logic.ts#montantsDevis` réutilise le miroir (`apercuFacture.logic.ts` ou un
  `shared/lib/lignesPennylane.ts` pur) ; TVA ligne par ligne ; test de parité devis ajouté à
  `lignesFacture.test.ts`.
- Migration : oui, `20261002090000_quotes_fiche_prix.sql` (déjà écrite) AVANT l'Edge.
- Edge : pennylane-quote + pennylane-invoice (le `_shared` change).
- Ordre : migration → merge → 2 Edge.

### U4 — Devis converti : une seule facture, suivie — ✔ FAIT (option A, PR #46, migration appliquée, déployé le 03/10/2026 : pennylane-quote v16, pennylane-invoice v37)
- Choix : **option A**. « Facturer directement » crée la course du devis en `livree`
  (`devis.logic#versLivraisonFacturable`, `justif_non_requis`, `quote_id`) puis la facture par
  `shared/lib/facturation.queries#facturerCourse` (même code que Livraisons) → Edge
  pennylane-invoice, qui passe le devis ACCEPTÉ à `facture` (+ `pennylane_invoice_id`).
  `pennylane-quote` action `convert` refusée (410) ; le front n'écrit plus `statut = facture`.
- Verrou d'envoi `quotes.envoi_verrou` + `quotes.sync_error` (migration
  `20261003120000_quotes_envoi_verrou`) ; refus affiché sur le devis, effacé au succès.
- Limite connue : chez Pennylane, le devis n'est pas relié à la facture (à clore à la main).
- Plan d'origine ci-dessous.
- Choix à valider : soit `convert` passe par `pennylane-invoice` (devis → course `livree` →
  facture standard, date Paris, échéance plafonnée, statut / paiement suivis), soit `convert`
  pose date + échéance et crée la ligne `deliveries` liée. Dans les deux cas : bloquer
  « Transformer » si `pennylane_invoice_id`, et inversement.
- Verrou devis (colonne `quotes.envoi_verrou` ou garde `.is('pennylane_quote_id', null)` sur
  l'update), `sync_error` devis ; supprimer `DrawerDevis.tsx:332`.
- Migration : oui si verrou en colonne. Edge : pennylane-quote (+ invoice selon choix).
- Tests : double clic → 1 seul devis ; devis facturé non transformable.

### U5 — Dates et paiements réels — codé (PR en cours ; Edge : invoice, register-payment, payment-check, last-numbers)
- Réalisé : `_shared/dates.ts` (`jourParis`, `anneeParis`, `jourParisDe`, `horodatageDuJour`, testés)
  utilisé par pennylane-invoice (date de facture), register-payment (jour du paiement à Paris),
  last-numbers (année à Paris) et payment-check ; payment-check : `paid_at` = date de la
  transaction rapprochée chez Pennylane (sinon maintenant), avoir → `annulee` + trace dans
  `sync_error` ; `_shared/totaux.ts#totalTtcCourseCts` = miroir testé de `deliveryTotalTtcCts`
  (remplace `ttcCourseCts`). Sans migration. Reste hors lot : saisir la date réelle d'un
  paiement à la main (le front pose « maintenant »). Plan d'origine ci-dessous.
- `_shared/dates.ts` : `jourParis()` (reprendre `pennylane-invoice:293`) utilisé partout
  (register-payment, payment-check, last-numbers).
- `pennylane-payment-check` : `paid_at` = date du paiement Pennylane si lisible ;
  `facturee → annulee` via une fonction commune avec trace (`sync_error` « Annulée par avoir <n°> »).
- `pennylane-register-payment` : remplacer `ttcCourseCts` par un `_shared/totaux.ts` miroir de
  `deliveryTotalTtcCts` (test de parité).
- Migration : non. Edge : register-payment, payment-check, last-numbers.

### U6 — Mentions légales et libellés (= lot E de la fiche livraison)
- `_shared/mentionsFacture.ts` (pénalités, 40 €, indexation gazole, autoliquidation) ajouté au
  champ de pied de facture Pennylane (champ exact à vérifier dans l'API) + miroir dans l'aperçu.
- Libellé par défaut unique facture / devis (y compris messagerie).
- Migration : peut-être (paramètres société : taux pénalités, indice gazole). Edge : invoice, quote.

### U7 — Fournisseurs / charges
- `pennylane-sync` : taux via `codeTvaLegal` (taux non légal → signalé, pas calé à 19 %) ;
  « local gagne » sur les champs corrigés à la main ; fournisseurs en « local gagne ».
- Option : importer échéance et état payé des factures fournisseurs (colonnes à créer).
- Migration : seulement si option retenue. Edge : pennylane-sync.

### U8 — Ménage (confort)
- `send-client-email` passe par `_shared/pennylane.ts` ; un seul helper d'auth ; erreurs
  Pennylane lisibles partout (`detailPennylane` dans `_shared/http.ts`).
- Mettre à jour `mca-spec/CARTE-INTERCONNEXIONS.md` (§ 3 Edge, `quotes`, `clients`).

- Ordre conseillé : U1 → U2 → U3 → U4 → U5 → U6 → U7 → U8 (U1 et U2 bloquants d'abord).

## 5. À tester
- Client UE (pays DE, n° TVA) créé par un devis puis facturé : pays et TVA justes chez Pennylane.
- Synchro clients : client archivé reste archivé ; SIRET 14 chiffres local conservé ; SIREN rangé à part.
- Devis messagerie 1 240 colis × 1,00 € + supplément : même lignes chez Pennylane que l'aperçu.
- Devis autoliquidé : code `exempt` + mention art. 259-1 sur chaque ligne.
- Devis converti : échéance ≤ 30 j, suivi payé / annulé, « Transformer » bloqué.
- Double clic « Envoyer à Pennylane » sur un devis : un seul devis créé.
- Paiement déclaré à 1 h du matin : bonne date chez Pennylane.
- Avoir chez Pennylane : course `annulee` avec trace lisible.
- Chauffeur : appel direct de `pennylane-sync` / `payment-check` / `clients-sync` / `qonto-sync` → 403.
- Charge Pennylane à 19 % ou 2,1 % : pas de taux inventé.
- Facture : mentions pénalités, 40 €, gazole présentes sur le PDF Pennylane.
