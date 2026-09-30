# 03 — Livraisons (section complète)

> Un fichier = un onglet (plan fixe, modèle `01-mes-courses.md`).
> Dernière mise à jour : 30/09/2026 — cartographie A→Z (4 relectures du code, requêtes
> SQL en lecture sur la prod), avant tout correctif.
> Section = 4 sous-onglets : Livraisons · Devis · Modèles · Bons de livraison, + la fiche
> d'une livraison (tiroir à 5 onglets) + les Edge Functions Pennylane / e-mail.

## 1. Rôle
- Registre des courses : saisir, suivre la machine à états, prouver (POD, lettre de voiture),
  facturer (Pennylane), envoyer la facture, encaisser. Devis en amont, modèles pour aller vite.
- Doit servir l'express (course = retrait + livraison, heure limite) et la messagerie
  (nombreuses livraisons / colis, échecs, relivraisons).

## 2. Qui voit quoi
- Section `/livraisons?tab=livraisons|devis|modeles|bl` ; un onglet n'apparaît qu'avec
  `can(<clé>,'view')` (président : tout). Clés : `livraisons.livraisons` (Livraisons + BL),
  `livraisons.devis`, `livraisons.modeles`.
- RLS `deliveries` : lecture président / DG / comptable = tout, autres = courses dont ils sont
  chauffeur ; écriture = président ou droit create / update / delete ; AUCUNE restriction par
  colonne (un chauffeur avec update peut réécrire montants et statut).
- RLS `quotes` / `delivery_templates` : lecture réservée aux rôles président / DG / comptable,
  écriture par droits → incohérent (voir bugs S3).
- `documents` : lecture toute la société, écriture par `systeme.documents` ; Storage
  (bucket `documents`) : lecture ET suppression ouvertes à tout membre de la société.
- Côté écran, seuls « Nouveau » (Livraisons), Enregistrer et Supprimer (fiche) vérifient
  les droits. Facturer, resynchroniser, envoyer l'e-mail, exporter, changer de statut,
  « Enregistrer comme modèle », Nouveau devis / modèle : aucun contrôle.
- Edge Functions en service role sans contrôle de société / droit : `pennylane-invoice`,
  `pennylane-register-payment`, `pennylane-last-numbers`, `pennylane-quote`
  (`send-client-email` vérifie la session et la société, pas le droit).

## 3. Les écrans, de haut en bas

### 3.1 En-tête de section (tous sous-onglets)
- Sous-onglets Livraisons · Devis · Modèles · Bons de livraison.
- `DerniersNumeros` : « FA <dernière facture> · DE <dernier devis> » (Edge
  `pennylane-last-numbers`, 100 derniers documents sans tri garanti), masqué sur mobile.
- Boutons « Nouveau » et « Export » (portail de la barre d'actions).

### 3.2 Livraisons (liste) — `Livraisons.tsx`
- 4 KPI (anciennes cartes, 2 colonnes mobile / 4 PC) :
  - « Ce mois » : nb de courses ≥ 1er du mois (bug de fuseau : commence la veille ; pas de
    borne de fin : compte les mois futurs) ;
  - « CA facturé » : HT facturé + payé sur TOUTES les lignes chargées (pas le mois), TVA et
    TTC en dessous ;
  - « À facturer » : nb de livrées ;
  - « En att. paiement » : TTC des facturées.
  - Tous dépendent des filtres de l'écran, et ignorent le filtre « sans justificatif ».
- Bandeau « N livraisons en attente de synchronisation Pennylane » + Resynchroniser.
- Bandeau « N sans justificatif » si `?filtre=sans_justif` (le bouton de sortie efface aussi
  `?tab=`).
- Filtres : date début, date fin, statut. Pas de recherche, pas de client / chauffeur (la
  requête les gère), pas de raccourcis de période. La recherche du haut (`?q=`) est ignorée.
- Barre de facturation groupée (lignes cochées, un seul client) : total HT / TTC,
  Prévisualiser (aperçu), Facturer (N) (modale maison).
- Tableau PC : case (si livrée, sans facture, HT > 0) · Date · N° facture (ou « en
  attente ») · Client · Chauffeur (avatar) · Montant HT (TTC dessous) · km · Statut
  (+ « Preuve ✓ ») · enveloppe e-mail (facturée / payée) · « Voir ».
- Cartes mobile : client, statut, preuve, date, chauffeur, type, n° facture, HT. Absents :
  e-mail, TTC, km, « en attente » ; case de 16 px.
- Ouverture directe `?ouvrir=<id>` (depuis le Dashboard).

### 3.3 Fiche d'une livraison — `DrawerLivraison.tsx` (1 833 lignes)
- En-tête : « Livraison — client » ou « Nouvelle livraison » ; statut, type, date.
- Onglets : création = Détail · Montant ; modification = Détail · Montant & Suivi ·
  Documents · POD · Lettre de voiture (barre sans défilement : déborde sur mobile).
- Verrou : Détail et Montant en lecture seule si facturée / payée / annulée. POD verrouillé
  seulement si annulée. Lettre de voiture jamais verrouillée.
- **Détail** : Partir d'un modèle (création, s'il y en a) · Date planifiée* (défaut =
  « aujourd'hui » figé au chargement du site, en UTC) · Type (particulier / professionnel)
  · Client* (clients actifs ; téléphone, e-mail, délai de paiement) · Véhicule · Chauffeur
  · Description (= libellé de la facture) · Adresse d'enlèvement (facultative, « vide = part
  du dépôt ») · Adresse de livraison* (autocomplétion Photon, coordonnées « 📍 ») · KM en
  charge (+ « Calculer le trajet » IGN) · KM à vide (jamais utilisé) · Notes ·
  Enregistrer / Annuler / Supprimer · Enregistrer comme modèle (toujours visible).
- **Montant & Suivi** :
  - Suivi (modification) : frise planifiée → en cours → livrée → facturée → payée (dates
    facture / paiement) ; boutons selon le statut : Démarrer, Marquer livrée, Annuler la
    livraison (sans confirmation), Facturer, Encaisser ; Prévisualiser la facture ; envoi
    au client (facturée / payée).
  - Montant : mode tarifaire du client (forfait / km / palette / manuel) ; champ selon le
    mode (Distance*, Nombre de palettes* — stocké dans `weight_kg`, Montant HT*) ;
    Autoliquidation (art. 259-1 CGI, avertissement si pas de n° TVA intra) ; Taux TVA
    (0 / 5,5 / 10 / 19 / 20) + Montant TVA (✎ / auto) ; Lignes supplémentaires (libellé,
    quantité, HT unitaire, TVA %) ; récapitulatif HT / TVA / lignes / TTC ; N° facture,
    « Sync en attente », « Anomalie » (`sync_error`).
- **Documents** : `DocumentsPanel` (tous les fichiers de la course, catégories, envoi
  multiple, téléchargement ; corbeille réservée au rôle président en dur).
- **POD** : photo (déposée tout de suite) + nom du réceptionnaire → « Preuve enregistrée »
  (seule la photo POD la plus récente est montrée) ; case « Aucun justificatif requis ».
- **Lettre de voiture** : expéditeur (nom*, SIREN, tél.), destinataire (nom* — repli nom du
  client, tél.), marchandise*, nb colis*, poids réel* ; 3 signatures (expéditeur,
  transporteur, destinataire, avec géolocalisation) ; mentions manquantes ; Générer /
  Regénérer le PDF (numéro LV-AAAA-N) / Re-télécharger.
- Boîtes de confirmation : suppression (acquittement si facturée) ; « Facturer sans
  preuve » (case « aucun justificatif attendu »).

### 3.4 Devis — `features/devis`
- Liste : Date · N° devis · Client · Description · TTC · Validité (« ⚠ » si expiré) ·
  Statut · Ouvrir ; mobile sans n° de devis. Pas de KPI, filtre, recherche, tri, export,
  ni lien vers la livraison issue du devis.
- Fiche : client, date, validité (défaut +30 j, en réalité +29 j : bug de fuseau), description,
  adresses, véhicule, chauffeur, HT, taux, TVA, notes. Boutons par statut :
  brouillon (Enregistrer, Envoyer chez Pennylane) · envoyé (Accepté, Refusé) · accepté
  (Transformer en livraison, Facturer directement, Refusé) · final (Fermer). Supprimer.
- Statuts : brouillon, envoye, accepte, refuse, expire (jamais posé), facture, transforme.
  Aucune machine à états.

### 3.5 Modèles — `features/modeles`
- Liste : Libellé · Client · Trajet (A → B) · HT · Ouvrir. 0 modèle en base.
- Fiche : libellé*, client (ou générique), description, adresses (texte libre, sans
  autocomplétion), HT, taux, type (texte libre ≠ particulier / professionnel), poids, km,
  km à vide, véhicule, chauffeur.

### 3.6 Bons de livraison — `BonsLivraison.tsx`
- Liste des courses ayant un numéro de lettre de voiture : N° BL · Date · Client · « Voir
  PDF » (si lien) ou « Regénérer » (ouvre la fiche sur l'onglet LV). Mobile : sans date ni
  PDF. Filtres : dates seulement. Vocabulaire : « BL » désigne en fait la lettre de voiture.

## 4. Gestes et écritures (fonction par fonction)

### 4.1 Liste
- `load` : `getDeliveries(filters)` → toutes les courses (`*` + client, véhicule,
  chauffeur), sans limite ; vide la sélection de facturation à chaque rechargement.
- `loadPendingSync` : courses facturées `sync_pending` sans facture Pennylane.
- `loadDocumentsLivraison` : TOUS les documents de livraison, à chaque ouverture (servent
  seulement au filtre « sans justificatif »), jamais rafraîchis.
- `handleResync` → `resyncPending` : relance `pennylane-invoice` course par course.
- `toggleInvoice` : coche / décoche, verrouille sur le client de la 1re ligne.
- `handleInvoice` : Edge `pennylane-invoice {delivery_ids}` appelée directement depuis
  l'écran (hors `*.queries.ts`) ; l'Edge passe les courses en `facturee` (sans
  `canTransition`).
- `handleSendEmail` → Edge `send-client-email {delivery_id}` → `email_sent_at`.
- Export CSV : Date ; Client ; Véhicule ; Chauffeur ; HT/TVA/TTC en centimes bruts (sans
  lignes supplémentaires) ; statut en code interne ; km ; sans échappement des « ; ».

### 4.2 Fiche — enregistrement
- `handleSave` : contrôle client, date, adresse de livraison ; nettoie les lignes
  supplémentaires ; géocode l'adresse (Edge `geocode`) si pas de coordonnées ; écrit
  date, client_id, vehicle_id, driver_id, type, description, pickup_address,
  delivery_address, delivery_lat/lng, km, empty_km, weight_kg (← palettes), amount_ht_cts,
  tva_rate, tva_cts, amount_ttc_cts (autoliquidation : TVA 0, TTC = HT), autoliquidation,
  notes, extra_lines ; création : + company_id, statut planifiee.
- Jamais éditables nulle part : `arrival_time` (heure prévue / limite), `delivered_at`,
  `tour_id`, `stop_order`, `pickup_order`, `retrait_a_faire`, `charge_le`,
  `probleme_*` (échecs chauffeur, même pas affichés), `quote_id`, `invoice_group_id`,
  `relance_*`. Contacts et nb de colis : seulement dans l'onglet LV, après création.
- `handleCalcTrajet` → Edge `route-calc` (BAN + IGN) : ne garde que la distance arrondie ;
  durée et coordonnées ignorées.
- `applyTemplate` / `handleSaveAsTemplate` : voir 4.5.
- `handleDelete` : supprime la ligne ; ni documents, ni Pennylane.

### 4.3 Fiche — statuts et argent
- Machine réelle (`shared/lib/livraisonStatuts.ts`) : planifiee → en_cours / livree /
  annulee ; en_cours → livree / annulee ; livree → facturee ; facturee → payee ; payee et
  annulee → rien. Aucun retour arrière.
- `computeAmount` : forfait = tarif ; km = tarif × km ; palette = tarif × palettes ;
  manuel = HT saisi. TVA auto = `round(HT × taux)` sauf TVA saisie à la main.
- `handleTransition('facturee')` : exige HT stocké > 0 ; vérifie la preuve
  (`isLivraisonSansJustif`) → boîte « Facturer sans preuve ».
- `transitionDelivery` : `canTransition` (statut d'origine pris dans l'écran, pas relu en
  base) ; écrit statut (+ invoiced_at et montants si facturée, paid_at si payée ; rien si
  livrée : `delivered_at` jamais rempli) ; puis Edge `pennylane-invoice` (échec →
  `sync_pending`, sans cause) ou `pennylane-register-payment` (échec ignoré).
- Edge `pennylane-invoice` : relit les courses ; client unique ; pas déjà facturées ;
  HT > 0 ; taux effectif = TVA / HT arrondi au 1/10 → code TVA Pennylane (sinon 422) ;
  libellé = description ou « Livraison <type> du <date ISO> » (+ mention autoliquidation) ;
  lignes supplémentaires avec leur propre taux (même en autoliquidation) ; client Pennylane
  créé si besoin (pays FR et « société » en dur, sans n° TVA intra) ; échéance selon le
  délai client ; brouillon → finalisation → numéro ; écrit pennylane_invoice_id / number,
  invoice_group_id, statut facturee, invoiced_at, sync_pending false (résultat non vérifié).
- Edge `pennylane-register-payment` : déclare le TTC de la ligne principale seule.
- Edge `send-client-email` : PDF facture Pennylane (sans rafraîchir une URL expirée) + la
  lettre de voiture seulement si elle est sur Google Drive ; envoi Gmail ; montant du
  message = TTC d'une seule course.

### 4.4 Documents, POD, lettre de voiture
- `uploadDocument` : compression (1 Mo / 1920 px), Storage `documents`, ligne
  `documents` ; n'écrit jamais `drive_link`.
- POD bureau : photo + nom obligatoires → `pod_recipient_name`, `pod_captured_at` ;
  « Remplacer la photo » ajoute une photo sans effacer l'ancienne.
- LV : `persist` écrit expéditeur / destinataire / marchandise / colis / poids ET tout
  l'objet `lv_signatures` depuis l'état de l'écran ; `handleGenerate` : numéro =
  max(LV-AAAA-N) + 1 calculé dans le navigateur, PDF jsPDF, envoi Storage, puis
  `lv_pdf_url = doc.drive_link` (toujours vide depuis Storage).
- `isLivraisonSansJustif` : justifiée si POD, LV archivée, `justif_non_requis`, ou n'importe
  quel document lié (même une photo de chargement ou « Autre »).
- Lien avec Mes courses : mêmes colonnes ; le chauffeur ajoute ses signatures par
  fusion (`ajouterSignature`) alors que le bureau réécrit l'objet entier.

### 4.5 Devis et modèles
- Devis : `createQuote` / `updateQuote` ; Edge `pennylane-quote` : `create` (devis
  Pennylane, statut envoye), `sync-number`, `convert` (facture Pennylane FINALISÉE, sans
  vérifier « accepté ») ; `transformToDelivery` : crée une livraison planifiée (date UTC,
  sans notes ni autoliquidation) puis passe le devis en « transforme » (non atomique).
- Modèles : CRUD `delivery_templates` ; dans la fiche livraison, `applyTemplate` recopie
  client, véhicule, chauffeur, type, description, adresses, km, palettes, HT et TVA (mais
  pas le taux, ni l'autoliquidation, ni les lignes supplémentaires ; efface le client déjà
  saisi si le modèle est générique) ; `handleSaveAsTemplate` n'enregistre le HT qu'en
  mode manuel et ne cale pas le taux.

## 5. Données lues
- Liste : `deliveries` complètes (`*`, y compris les signatures PNG en base64 ≈ 1,1 Mo au
  total aujourd'hui) + client (nom, tarif, e-mail) + véhicule + chauffeur ; `documents`
  de livraison ; courses `sync_pending`.
- Fiche : clients actifs (tarif, contact, délai, TVA intra), véhicules actifs, chauffeurs
  actifs ; modèles ; documents de la course ; société (pour la LV — import depuis la
  feature Paramètres, interdit) .
- Devis : `quotes` + client ; clients / véhicules / chauffeurs (filtres différents d'une
  feature à l'autre). Modèles : `delivery_templates` + client.
- Prod (30/09) : 2 devis (transformés), 0 modèle, 6 numéros LV mais 5 liens PDF, 28 clients
  tous en tarif manuel.

## 6. Fichiers
- `src/app/sections/LivraisonsSection.tsx`.
- `src/features/livraisons/` : `Livraisons.tsx` (623 l.), `DrawerLivraison.tsx` (1 833 l. :
  fiche + MontantTab, SuiviTab, EnvoiClientSection, PodTab, ExtraLinesEditor/Row),
  `LettreVoitureTab.tsx`, `lettreVoiture.logic.ts` + `.pdf.ts`, `ApercuFacture.tsx` +
  `apercuFacture.logic.ts`, `BonsLivraison.tsx`, `DerniersNumeros.tsx`,
  `livraisons.logic.ts` / `.queries.ts` / `.types.ts`, `emailClient.logic.ts` (mort en prod).
- `src/features/devis/`, `src/features/modeles/`.
- Partagé : `livraisonStatuts`, `livraisonsSansJustif`, `money`, `montants`, `tvaRate`,
  `documents.*`, `pod.queries`, `photon`, `DocumentsPanel`, `SignaturePad`, `ConfirmDialog`,
  `TvaRateInput`, `AddressAutocomplete`.
- Edge : `pennylane-invoice`, `pennylane-register-payment`, `pennylane-last-numbers`,
  `pennylane-quote`, `send-client-email`, `route-calc`, `geocode`.

## 7. Critique (30/09/2026)

### Bon
- Machine à états unique et respectée par la fiche ; facturation Pennylane groupée par
  client avec aperçu ; autoliquidation prévue ; lettre de voiture légale complète avec
  signatures ; POD photo ; envoi facture + LV au client ; montants HT en principal.

### Visuel (capture du 30/09) — à harmoniser avec le Dashboard
- KPI : anciennes grosses cartes (≈ 160 px) au lieu des cartes compactes du Dashboard ;
  « CA facturé » mis en avant (bordure verte) sans raison.
- Filtres : bande pleine largeur pour 3 champs, grand vide.
- En-tête : « FA FA-2026-09-34 · DE DE-2026-09-16 » redondant et peu lisible.
- Tableau : lignes hautes, 4 lignes visibles sur un écran ; « Voir » en double du clic ;
  « Preuve ✓ » en texte ; km peu utile en tête ; pas de trajet ni d'heure ; `livree` et
  `facturee` de la même couleur.
- Ne respecte pas la règle « un écran de consultation tient sur un écran PC ».

### Pas bon — bloquant (argent ou preuve perdus)
- B1. Lettre de voiture : depuis le passage à Storage, `lv_pdf_url` n'est plus rempli →
  plus de lien PDF, BL toujours en « Regénérer », et **la LV n'est jamais jointe à
  l'e-mail client** (l'Edge ne sait lire que Google Drive).
- B2. Double numéro LV : la fiche n'est pas rechargée après « Générer » → un 2e clic
  attribue LV-N+1 ; numérotation calculée dans le navigateur, sans unicité en base.
- B3. Facture bloquée sans issue : statut `facturee` écrit AVANT Pennylane ; si Pennylane
  refuse (taux non légal, ligne invalide), la course reste facturée sans facture, sans
  cause (`sync_error` vide), Montant verrouillé, resync voué à l'échec, aucun retour.
- B4. Double facturation possible : si l'écriture finale de `pennylane-invoice` échoue
  (non vérifiée) ou si on resynchronise pendant une facturation en cours.
- B5. TVA figée en modification : changer le HT garde l'ancienne TVA → taux non légal →
  B3. Le taux 5,5 % est relu comme 6 %.
- B6. Montants effacés : si le client est devenu inactif (ou listes pas encore chargées),
  l'enregistrement écrit HT / TVA / TTC à vide.
- B7. Autoliquidation à moitié : les lignes supplémentaires partent taxées (20 %), le
  récapitulatif affiche une TVA, le client Pennylane est créé sans n° TVA intra ni pays.
- B8. Paiement partiel déclaré à Pennylane (sans lignes supplémentaires, facture groupée
  course par course) ; e-mail client avec le TTC d'une seule course.
- B9. Échecs chauffeur (absent, refus…) invisibles dans cet onglet ; heure prévue non
  saisissable nulle part.

### Pas bon — sécurité et droits
- S1. Edge Pennylane (facture, paiement, devis → facture FINALISÉE) sans contrôle de
  société ni de droit : tout compte connecté, chauffeur compris, peut facturer.
- S2. Storage `documents` : tout membre de la société peut lire et supprimer n'importe quel
  fichier ; un chauffeur qui retire une photo laisse une fiche fantôme qui compte encore
  comme justificatif.
- S3. Devis / Modèles : lecture réservée à 3 rôles mais onglets donnés par droits → liste
  vide pour un utilisateur autorisé.
- S4. Aucun contrôle de droit à l'écran pour facturer, encaisser, envoyer, exporter,
  annuler, créer un devis / modèle ; corbeille des documents au rôle « président » en dur.

### Pas bon — données et règles
- D1. « Ce mois » (liste) et validité des devis : bug de fuseau (veille / +29 j) ; date du
  jour de la fiche figée au chargement du site, en UTC.
- D2. `delivered_at` jamais rempli par « Marquer livrée » → l'alerte « livrées non
  facturées » ne se déclenche pas.
- D3. Aperçu facture ≠ facture réelle (libellé, taux arrondi à l'entier, autoliquidation
  absente, lignes invalides comptées) ; la modale « Facturer (N) » contourne les blocages
  de l'aperçu ; message d'erreur Pennylane précis perdu (« non-2xx »).
- D4. Signatures : le bureau réécrit tout l'objet et peut effacer une signature prise
  entre-temps par le chauffeur ; au bureau, la géolocalisation est celle du bureau.
- D5. Terrain vs bureau : un nom seul suffit au chauffeur pour horodater le POD ;
  « Livrer sans preuve » enregistre quand même un POD ; le nom de la personne qui remet
  écrase la raison sociale expéditeur ; `weight_kg` = kg OU palettes.
- D6. Règle « sans justificatif » trop large (une photo de chargement suffit).
- D7. Devis : aucune machine à états ; « Facturer directement » crée une facture hors
  livraisons (invisible en Encaissement, TVA, Relances) ; transformation non atomique
  (doublon possible) ; modifications non enregistrées perdues à l'envoi.
- D8. Liste non paginée (tronquée sans message au-delà de 1 000 lignes) ; `select *` avec
  les signatures en base64.
- D9. Annuler une course : sans confirmation, irréversible.

### Pas bon — architecture et dette
- A1. Imports entre features : Dashboard, Calendrier, Planning, Tournées, Assistant et
  SyncProvider importent `livraisons` ; LV importe `parametres`.
- A2. Appels hors `*.queries.ts` (Edge et requêtes dans les composants) ; Photon appelé
  depuis le navigateur.
- A3. Code mort / doublons : `emailClient.logic.ts` (la vraie logique est copiée dans
  l'Edge), `TYPE_COLORS`, `DeliveryUpdate`, statuts `brouillon` / `validee`, repli
  `montant_*` (colonnes supprimées en base), barème TVA dupliqué, `createTemplate` ×2,
  `listClientsLight` ×2, `InfoRow` / `inputCls` ×2, conversions €/cts à la main.
- A4. CLAUDE.md décalé : `planifiee → livree` autorisé, sous-onglets réels ≠ doc,
  `montant_*` n'existent plus, défaut `statut = 'brouillon'` en base, vocabulaire « V2 »
  dans le code, création des tables `quotes` / `delivery_templates` non versionnée.

## 8. Lots (proposés, à valider)
- Lot 1 — « l'argent et les preuves ne se perdent plus » :
  - LV : `lv_pdf_url` rempli depuis Storage, e-mail qui joint la LV depuis Storage,
    fiche rechargée après génération, numérotation unique côté base ;
  - facturation : Pennylane d'abord, statut ensuite (ou retour à « livrée » + cause
    affichée si refus) ; écriture finale vérifiée ; message d'erreur précis ;
  - TVA : taux relu depuis `tva_rate` (5,5 exact), TVA recalculée quand le HT change ;
    montants jamais effacés (client inactif chargé quand même) ;
  - autoliquidation complète (lignes supplémentaires, récapitulatif, client Pennylane) ;
  - paiement / e-mail au bon montant (facture entière).
- Lot 2 — sécurité : contrôle société + droit dans les 4 Edge Pennylane ; droits à l'écran
  (facturer, encaisser, envoyer, exporter, annuler) ; Storage et suppression de documents
  alignés sur les droits ; lecture Devis / Modèles alignée sur les droits.
- Lot 3 — l'écran (harmonisation + express) : cartes compactes du Dashboard, période par
  défaut + raccourcis, recherche `?q=` branchée, filtres client / chauffeur / échecs,
  colonnes Trajet et Heure, badge d'échec + Replanifier / Problème réglé, heure prévue,
  contacts et nb de colis dans Détail, confirmation d'annulation, `delivered_at`, tient
  sur un écran, pictogrammes à la place des ✓ / 📍 / ✎ / ⚠.
- Lot 4 — Devis / Modèles : machine à états des devis, « Facturer directement » relié à
  une livraison, dates corrigées, modèles cohérents (taux, type, autocomplétion).
- Lot 5 — dette : imports entre features, requêtes hors `*.queries.ts`, code mort,
  doublons, CLAUDE.md remis à jour, migrations manquantes versionnées.
- Lot 6 — messagerie : colis multiples, import de tournée, relivraison chaînée, retour
  dépôt.

## 9. À tester après chaque PR
- Générer une LV → lien PDF immédiat, un seul numéro même en recliquant ; e-mail client
  avec facture + LV jointes.
- Facturer une course à 5,5 % et une en autoliquidation avec lignes supplémentaires →
  facture Pennylane correcte ; refus Pennylane → course revenue en « livrée » avec la
  cause affichée.
- Modifier le HT d'une course existante → TVA et TTC recalculés.
- Chauffeur connecté → impossible de facturer / encaisser (écran ET Edge).
- 1er et dernier jour du mois → bien comptés ; devis +30 j exacts.
