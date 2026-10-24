# Carte des interconnexions — qui lit / écrit quoi

> À ouvrir AVANT de toucher une table, une colonne, un statut, une Edge ou une règle de calcul
> (CLAUDE.md § 7). À mettre à jour à chaque fin de grosse session (CLAUDE.md § 10).
> Relevée dans le code le 01/10/2026, mise à jour le 18/10/2026 (tournées de colis). En cas de doute, le code fait foi :
> `grep -rln "from('<table>')" src supabase/functions`.

## 1. Tables → lecteurs / écrivains
- **deliveries** (le cœur, ~80 accès) — `sync_error` est aussi écrit par pennylane-payment-check
  (trace de l'annulation par avoir, U5) :
  - front : livraisons (écrit tout), mescourses (statut, preuves, problème terrain),
    tournees (tour_id, stop_order, arrival_time ; `date` quand une course en retard est
    remise dans la tournée du jour — lot P3), planning (écrit `driver_id`, `date` par
    glisser-déposer / action groupée ; détache de sa tournée : tour_id, stop_order, arrival_time
    à null ; vue Mois via livraisons.queries#getDeliveries),
    dashboard, alertes, clients (encours), equipe, heures, devis
    (crée une course depuis un devis), copilote / assistant (création IA) ;
  - shared : `alertesEngine.queries` (à facturer, sans justificatif, retards), `pod.queries` ;
  - Edge : pennylane-invoice (écrit `facturee`, n° facture, sync_error), pennylane-register-payment
    (`payee`), pennylane-payment-check, send-client-email (email_sent_at), geocode,
    (plus d'optimize-tour(s) : 410, 22/10/2026).
- **clients** : clients (écrit), livraisons (tarif, délai, TVA intra), devis,
  copilote / assistant ; Edge pennylane-invoice, pennylane-quote,
  pennylane-clients-sync (écrit).
  - colonnes « défauts des courses » (lot B : `pays`, `retrait_*`, `chauffeur_habituel_id`,
    `vehicule_habituel_id`, `prestation_defaut`, `reference_obligatoire`, `supplements`) :
    écrites par la fiche client ; lues par la fiche livraison (`CLIENT_FICHE_COLS`) et
    l'Edge pennylane-invoice (`pays`, `reference_obligatoire`). Non touchées par
    pennylane-clients-sync (upsert de colonnes listées).
  - `siren` (U2, 03/10/2026) : écrit par la fiche client (saisi ou déduit du SIRET) et par
    pennylane-clients-sync (reg_no) ; la synchro suit `_shared/clientPennylane#ligneClientSync`
    (le site gagne : nom, SIRET, TVA, coordonnées ; archivé reste archivé). Libs partagées :
    `shared/lib/pays.ts` (UE, autoliquidation), `shared/lib/supplements.ts`.
- **vehicles / team_members** : flotte (vehicules, carburant, entretiens, inspections, incidents),
  livraisons, tournees, planning (échéances permis / visite médicale / CT / assurance à
  l'affectation), mescourses, equipe, heures, alertes, devis ; planning (lecture
  des échéances : `ct_expiry`, `insurance_expiry`, `next_revision_date`, `licence_b_expiry`,
  `medical_visit_expiry` via `planning.queries#getSourcesEcheances` : vue Mois + en-têtes de jour).
- **documents** (+ Storage `documents`) : `shared/lib/documents.queries` (tous les panneaux
  Documents), mescourses (photos), parametres ; Edge send-client-email (facture seule : plus de lettre de voiture),
  drive-migrate-to-storage ; alertes (sans justificatif).
- **charges** : charges, fournisseurs, tresorerie, `shared` aRapprocher (catégorisation, Pennylane) / alertes ;
  Edge pennylane-sync, lire-facture, lire-releve, suggest-categorie-ia.
- **tours** (22/10/2026) : plus AUCUN lecteur ni écrivain côté site (composeur express retiré avec la refonte Planning). Table et colonnes gardées en base (`tours`, `deliveries.tour_id` / `stop_order` / `pickup_order` / `arrival_time`) ; Edge `optimize-tours` et `optimize-tour` = 410. Fichiers supprimés : `tournees/{Tournees (ancien),TourCard,ToursOverviewMap,DialogueHeuresTournee,tournees.queries,tournees.types}`, `_shared/{routesOrs,planifExpress,vroom}`, l'express de Mes courses (`MesCourses` : OngletCourses, étapes terrain, PanneauProbleme), `shared/lib/{arretsJour,messageClient,tourneeStatuts}`.
- **tournees_colis / tournees_colis_arrets** (colonne `zone` ajoutée le 22/10/2026 : lue par l'Edge `optimiser-tournee-colis` (un bloc par zone), `shared/lib/tourneesColisRoute#infosGroupes` (couleurs liste / carte), `shared/ui/FeuilleAdresse` + liste bureau `tournees/ListeTourneeColis` (insert / update d'arrêts par le salarié sur SA tournée ou le bureau) ; lot TC1, migration
  `20261017090000_tournees_colis`, **en prod depuis le 18/10/2026**) : feuille de route de messagerie scannée et ses arrêts. Écrits
  par `shared/lib/tourneesColis.queries` depuis Mes courses › Ma tournée (salarié : SES tournées,
  non clôturées) et Tournées › bloc « Tournées de colis du jour » (bureau, droit
  `planning.tournees`). Trigger `tournees_colis_arrets_garde` : `statut_le` / `statut_par`,
  société = celle de la tournée. Pas des deliveries, ni facturation, ni paie, ni dashboard, ni
  alertes.
  - Lots 2 à 5 (migration `20261018090000_tournees_colis_route`, appliquée le 18/10/2026) :
    tournée `depart`, `arrivee`, `ordre_mode` (feuille / route / manuel), `ordre_calcule_le`,
    `trajet` (tracé, km, durée, `ordre_ids`), `cloturee_le` / `cloturee_par` (trigger
    `tournees_colis_touch`) ; arrêt `ordre`, `eta_min`, `geo_precision = 'manuel'` (placé à la
    main). `rang` = ordre de la feuille, jamais modifié. Le salarié peut passer SA tournée en
    `cloturee` ; seul le bureau la rouvre.
  - Écrits aussi par l'Edge `optimiser-tournee-colis` (session de l'appelant : ordre, eta,
    trajet, mode, départ).
  - **Lus par la journée de colis** : à la clôture, `tourneesColis.queries#preremplirJournee`
    crée / met à jour la `journees_colis` du jour en BROUILLON (domicile / relais = colis
    remis, litige = non remis + raisons ; collectes exclues ; jamais une journée envoyée ou
    validée). Règle pure : `tourneesColisRoute#journeeDepuisArrets`.
  - Scan v2 (migration `20261018110000_referentiel_tournees_colis`, appliquée le 18/10/2026) :
    `ordre_mode = 'habituel'` (tournée créée dans l'ordre habituel), arrêt `rang_habituel`.
- **referentiel_rues** (scan v2, 18/10/2026) : base reprise de l'outil de tournée d'origine
  (21 villages, 700 rues, 9 985 numéros positionnés, 627 rues avec ordre habituel, 4 relais).
  Lue par l'Edge `lire-feuille-route` (service, filtrée par société) ; règles pures
  `_shared/referentiel.ts`. Écrite : par la fonction `apprendre_position_arret` (security
  definer, appelée par `tourneesColis.queries#placerArret` : un arrêt placé à la main apprend
  son numéro), sinon président / `planning.tournees`. RLS : lecture société.
  **Zones (22/10/2026)** : colonnes `zone` (zone unique de la rue) et `zones` (toutes ses zones, fichier Excel
  « Tournée Brumath et villages 23 », 161 rues) ; écrites par la fonction `appliquer_zones_tournee` (security
  definer : apprend la zone lue sur une feuille pour les rues absentes du fichier, remplit `tournees_colis_arrets.zone`),
  appelée par `tourneesColis.queries#appliquerZones` (création de tournée, avant chaque recalcul, après une correction d'adresse).
- **positions_livreurs** (lot 3) : dernière position du livreur (une ligne par fiche, pas
  d'historique), écrite par Ma tournée si le salarié active « Partager ma position » (toutes
  les ~30 s, effacée à l'arrêt du partage et à la clôture) ; lue par Tournées › « Carte du
  jour » (bureau, `planning.tournees : view`). Le salarié ne voit que la sienne.
- **documents `entity_type = 'arret_colis'`** (lot 4) : photo de preuve d'un arrêt (catégorie
  POD), déposée par le livreur sur SA tournée non clôturée ; lue dans Ma tournée.
- **journees_colis → relevé de messagerie** (lot 5) : Livraisons › fiche relevé lit les
  journées du client du mois (`journeesColis.queries#journeesDuClient`,
  `journeesColis#colisPourReleve` : validées seulement) et propose le nombre de colis
  (« Reprendre ») ; les non validées sont signalées, jamais comptées.
- **work_hours** : heures (écrit tout), equipe ; tournees (lot P3 : après « Terminer la
  tournée », propose d'insérer la ligne du chauffeur — date, début, fin — si aucune ligne
  n'existe déjà pour ce chauffeur ce jour-là).
- **quotes** : devis, clients ; Edge pennylane-quote ; alertes. Fiche de prix (02/10/2026) :
  `prestation, unite, quantite, prix_unitaire_cts, extra_lines, reference_client,
  autoliquidation, accepte_le` + mêmes champs que la course (`expediteur_*`, `destinataire_*`,
  `marchandise_desc, nb_colis, poids_kg, volume_m3, km`) — écrites par le devis ; `amount_ht_cts / tva_cts` restent les
  TOTAUX ; l'Edge pennylane-quote lit la fiche de prix et envoie les mêmes lignes qu'une
  facture (U3 : quantité × PU + suppléments). Le devis écrit aussi
  `clients.tariff_mode / tariff_rate_cts / prestation_defaut` (« Appliquer ce prix au client »)
  et crée des `deliveries` (`quote_id`, tout repris).
  - U4 (03/10/2026) : « Facturer directement » = course `livree` (`quote_id`) facturée par
    pennylane-invoice, qui ÉCRIT `quotes.statut = facture` + `pennylane_invoice_id` (devis
    `accepte` seulement). `envoi_verrou` et `sync_error` : écrits par pennylane-quote (envoi),
    `sync_error` lu par le tiroir devis. L'action `convert` de pennylane-quote est refusée.
- **qonto_transactions** : tresorerie (lecture seule, depuis le 22/10/2026 : plus de rapprochement par ligne, `charge_id` / `justif_type` plus écrits par le site) ; Edge qonto-sync. Colonnes gardées en base.
- **fuel_logs** : carburant, vehicules, `shared/produitsVehicule.queries`.
- **vehicle_maintenances** : entretiens, vehicules, alertes, planning (vue Mois, `next_due_date` du dernier
  entretien par véhicule et type).
- **profiles / user_permissions** : `app/providers` (rôle, société), toutes les Edge via
  `_shared/auth.ts` (`exigerPermission`), admins ; RLS `has_permission`, `is_president`.

## 2. Colonnes sensibles de `deliveries` et leurs lecteurs
- `statut` : TOUT le monde. Transitions via `shared/lib/livraisonStatuts.ts`. → facturee écrit
  par l'Edge pennylane-invoice uniquement.
- `prestation` (01/10/2026) : fiche livraison (blocs affichés), liste (colonne Trajet via
  `trajetOuReleve`), facture (Edge + aperçu : relevé en quantité). **Filtre « sur la route »**
  `prestation.is.null,prestation.not.in.(messagerie,forfait)` dans : mescourses, tournees,
  planning, dashboard (journée) ; la vue Mois du planning filtre côté client. Tout NOUVEL écran « terrain »
  doit appliquer ce filtre.
- `nb_colis`, `prix_unitaire_cts` : relevé de messagerie (HT = nb × prix) ; facture en quantité ;
  `nb_colis` aussi écrit par Mes courses.
- `expediteur_* / destinataire_* / marchandise_desc / nb_colis / poids_kg_reel` : écrits par la
  fiche ET par Mes courses → la fiche ne les réécrit que s'ils ont changé.
- `notes` (consignes chauffeur) → Mes courses. `note_interne` → jamais montré au chauffeur
  (mais lisible par l'API : pas de secret dedans).
- `reference_client` : fiche, en-tête, libellé de facture (Edge + aperçu).
- `creneau_*`, `urgent` : fiche, Mes courses (pastille, créneau de l'arrêt).
- `arrival_time` : écrit par les tournées ; lu par Mes courses, liste, dashboard.
- `amount_ht_cts / tva_cts / amount_ttc_cts / extra_lines / autoliquidation` : fiche,
  liste, aperçu facture, Edge pennylane-invoice, dashboard, clients.
- `justif_non_requis`, `pod_captured_at`, `lv_pdf_url` : alerte « sans justificatif »
  (`shared/lib/livraisonsSansJustif`), facturation (avertissement), relevé de messagerie (true).
- `probleme_*` : Mes courses (écrit), liste (filtre Échecs), alertes, dashboard.

## 3. Edge Functions → appelants front
- pennylane-invoice, pennylane-register-payment, pennylane-last-numbers, send-client-email,
  route-calc : **livraisons**
- geocode : livraisons, parametres, tournees · 
- pennylane-quote : devis · pennylane-clients-sync : clients · pennylane-sync,
  suggest-categorie-ia : charges · pennylane-payment-check, qonto-sync : tresorerie
- lire-facture : carburant, entretiens · lire-releve : carburant
- lire-feuille-route (TC1, **v7 déployée le 22/10/2026**) : `shared/lib/tourneesColis.queries#lirePageFeuille`, appelée par
  `shared/ui/ScanFeuilleRoute` (Mes courses › Ma tournée, Tournées). N'écrit rien ; importe
  `_shared/mistral`, `_shared/feuilleRoute`, `_shared/geocodeArret`, `_shared/auth`, `cors`, `http`.
  v2 (18/10/2026) : lit aussi `adresse_remettant` dans l'en-tête (départ par défaut).
  v3 (18/10/2026) : lit `referentiel_rues` (+ `_shared/referentiel`) ; reçoit
  `commune_precedente` ; renvoie `rue_connue`, `ref_rang`, `ref_rang_commune` ; ajoute
  d'office les numéros manquants (`_shared/feuilleRoute#lignesEnArrets`).
- optimiser-tournee-colis (22/10/2026 **v15** : lit `zone`, `ordonnerZones` = zones de Brumath dans l'ordre 1 → 7 ; lots 2-5, **déployée le 18/10/2026, v2**, verify_jwt ; tracé par
  l'itinéraire IGN `data.geopf.fr/navigation/itineraire` ; aucun secours : erreur claire, ordre actuel intact) :
  `tourneesColis.queries#calculerItineraire`, appelée par Ma tournée (calcul, recalcul depuis
  ma position) et Tournées › bloc tournées de colis. Tourne avec la session de l'appelant
  (RLS, aucune clé de service). ORS (api.heigit.org) matrice (blocs ≤ 3 500) + itinéraires (≤ 50 points),
  trous de matrice bouchés par le vol d'oiseau ; solveur `_shared/tourneeRoute.ts` (exact ≤ 10 points, sinon
  plus proche voisin + 2-opt + Or-opt ; 150 points en ~12 ms). Lit `companies.depot_lat/lng`
  et `companies.depart_colis_lat/lng` (départ des tournées de colis, Paramètres › Société,
  prioritaire ; v3), `_shared/geocode` (adresse du remettant).
- ai-extract-deliveries : copilote, parametres · assistant-chat : assistant ·
  alertes-briefing : alertes · brouillons-generate : brouillons
- admin-users, admin-permissions : admins · drive-* : parametres
- Droits des synchros (U1) : chaque Edge de synchro exige un droit (`_shared/auth#exigerPermission`)
  et le front ne lance que les synchros permises (`shared/lib/autoSync#DROIT_SYNC`, miroir).
- Documents échus à l'affectation : `shared/lib/documentsAffectation#alertesAffectation` (Planning +
  Tournées ; lit `team_members.licence_b_expiry / medical_visit_expiry`, `vehicles.ct_expiry /
  insurance_expiry`).
- Facturation d'une course : `shared/lib/facturation.queries` (`facturerCourse`, `facturerGroupe`)
  — appelée par livraisons (ré-export) ET devis (« Facturer directement »).
- Front partagé : `shared/lib/prestations.ts` (types de prestation + `blocsPrestation`),
  `shared/ui/FicheSaisie` (Bloc, ChoixClient, ChoixPrestation : fiche livraison + devis), `shared/ui/LignesSupplementaires`
  (éditeur de suppléments : fiche livraison + devis).
- Code commun : `_shared/` (auth, cors, http, pennylane, lignesFacture, money, paymentTerms,
  supabase, mistral, justificatif…). **Modifier un `_shared` = redéployer TOUTES les Edge qui
  l'importent** (lister avec `grep -rl "_shared/<fichier>" supabase/functions`).

## 4. Règles en miroir front ↔ Edge (à modifier des DEUX côtés, tests des deux côtés)
- Lignes de facture : `_shared/lignesFacture.ts` ↔ `shared/lib/lignesPennylane.ts` (règles de base)
  + `features/livraisons/apercuFacture.logic.ts` (libellé, référence client, relevé en quantité,
  autoliquidation, taux légaux).
- Lignes de devis (U3) : `_shared/lignesFacture#construireLignesDevis` (Edge pennylane-quote) ↔
  `shared/lib/lignesPennylane#lignesDevis` (`devis.logic#montantsDevis`) ; TVA ligne par ligne.
- Délai de paiement : `_shared/paymentTerms.ts` (`echeanceTransport`, plafond 30 j) ↔
  `shared/lib/paymentTerms.ts` (`conforme`, `delaiConforme`).
- Montants / TVA : `_shared/money.ts` ↔ `shared/lib/money.ts` ; TTC dû d'une course :
  `_shared/totaux#totalTtcCourseCts` ↔ `shared/lib/money#deliveryTotalTtcCts` (U5, parité testée).
- Jour « de Paris » côté Edge : `_shared/dates.ts` (invoice, register-payment, payment-check,
  last-numbers) ; côté front : `isoLocal` / `toLocalISO`.

## 5. Imports entre features (exceptions existantes — ne pas en ajouter)
- assistant → presque tout (hub IA).
- planning, tournees, dashboard → livraisons (drawer, types, queries).
- livraisons → parametres.

## Cloisonnement du salarié (lot S0, 12/10/2026)
- `public.est_salarie()` (profil au rôle `chauffeur`) et `public.ma_fiche_equipe()` (fiche
  `team_members` reliée au compte) : utilisées par des policies RESTRICTIVES de lecture.
- Le salarié ne lit que : ses courses / tournées, les clients de ses courses, sa fiche, ses
  heures, ses documents (déposés par lui ou rattachés à ses courses) et leurs fichiers, ses
  tickets ; plus véhicules et société. Rien en finance, flotte (pleins, entretiens,
  inspections, incidents), fournisseurs, coûts.
- `team_members.profile_id` : écrit par l'Edge `admin-users` (create / invite avec
  `team_member_id`, `link_member`), depuis Équipe › fiche › « Accès au site ». Lu par les
  policies `deliveries_select_own` / `tours_select_own` et par Mes courses.
- Tournées de colis (TC1) : policies propres (salarié = `member_id = ma_fiche_equipe()` ;
  bureau = `planning.tournees` view / update / delete ou président).
- Toute NOUVELLE table lisible par la société doit recevoir sa policy « pas pour le salarié »
  (ou « les siennes ») dans la même migration.
- **Scan de feuille de route côté serveur (19/10/2026)** : tables `scans_feuille_route` (statuts brouillon →
  en_cours → pret → termine / annule / erreur) et `scans_feuille_route_pages` (photo en data URL, résultat par
  page) ; policy unique par table (salarié = SES scans, bureau = `planning.tournees` update). Écrivains :
  front (photos, création, annulation, terminer) + Edge `scanner-feuille-route` (résultats, clé de service) ;
  lecteurs : `ScanFeuilleRoute`, `useScanOuvert` (pastille + carte « Aujourd'hui »), `MaTournee`,
  `TourneesColisDuJour`. `_shared/lireFeuilleCore.ts` = lecture d'une page (aussi `lire-feuille-route`).
- Pause d'un arrêt (21/10/2026) : `tournees_colis_arrets.en_pause_le` écrit par `majArret` (salarié sur SA tournée,
  bureau) ; lu par `tourneesColisRoute` (liste, bandeau « En pause », clôture) et le bloc bureau ; n'agit pas sur l'ordre.
- **Feuilles de route conservées (22/10/2026)** : à la création de la tournée, chaque page scannée devient un `documents` (`entity_type = 'tournee_colis'`, `entity_id` = tournée, `notes = 'feuille'`, Storage `documents`) au lieu d'être effacée (`tourneesColis.queries#terminerScan`) ; lues par `feuillesDeRoute` (onglet Tournées › tiroir › Feuille de route). Les photos de synthèse ont `notes = 'synthese'` (`photosSynthese` exclut les feuilles). Si un envoi échoue, les pages de travail restent.
- Photos de synthèse (20/10/2026) : `documents` `entity_type = 'tournee_colis'` (policies insert / delete salarié sur SA
  tournée non clôturée) ; écrites par `FeuilleCloture` / `PhotosSynthese`, lues au bureau (liens « Synthèse n »).
- `optimiser-tournee-colis` mode `suivre` : lit `ordre` des arrêts, écrit `trajet` + `eta_min` (jamais `ordre`).
- Planning (19/10/2026) : lit aussi `tournees_colis` / `tournees_colis_arrets` via `shared/lib/tourneesColis.queries` (droit `planning.tournees`) ; écrit `deliveries.driver_id` / `date` seulement.

- **Finance (22/10/2026)** : onglets Encaissement et Relances SUPPRIMÉS (code + routes + droits du catalogue ; lignes `user_permissions` gardées). Alerte « factures en retard de paiement » → `/livraisons`. `aRapprocher` = charges seulement (catégorisation, supprimées Pennylane, hors Pennylane, avoirs) ; plus de compteurs trésorerie / encaissements. Listes Finance groupées par mois : `shared/lib/mois` + `shared/ui/GroupeMois`.
- **charges.passee_en_od** (22/10/2026) : écrit par `DrawerCharge` ; lu par `aRapprocher#estChargeHorsPennylane` (alerte cloche + bandeau Charges) et le badge « OD » de `Charges`.
- **receipts_inbox.rembourse_le** (22/10/2026) : écrit par `charges/Justificatifs` (bureau) ; lu par `mescourses/MesDepenses` (« Remboursée le … », total à rembourser) et `shared/lib/depenses#totalARembourser`. Statuts : `a_traiter` / `traite` (= Validé) / `ignore` (= Refusé).
- **Edge pennylane-justificatif** (v9, 23/10/2026) : envoie le ticket validé par mail (Gmail, `google_drive_tokens`) à `companies.pennylane_depot_email` ; écrit `receipts_inbox.pennylane_envoye_le / pennylane_erreur`, lit Storage `documents` ; appelée par `Justificatifs.tsx` (`receiptsInbox.queries#envoyerVersPennylane`).
- **Edge lire-ticket** (v2, 23/10/2026 ; appelée aussi par `receiptsInbox.queries#deposerTicket` pour le salarié déposant) : lit Storage `documents` + `receipts_inbox` + `suppliers` ; écrit `receipts_inbox.montant_ttc_cts / date_depense / categorie / supplier_id` (cases vides seulement) + `ocr_lecture / ocr_lu_le` ; appelée par `Justificatifs.tsx` (`receiptsInbox.queries#lireTicketIa`). Secret `MISTRAL_API_KEY`.
- **Edge pennylane-sync** (v23, 24/10/2026) : en plus d'écrire `charges` / `suppliers`, SUPPRIME les `charges` dont la facture a disparu de Pennylane, avec `documents` (entity_type charge) + fichiers Storage, `fuel_logs.charge_id`, `vehicle_maintenances.charge_id` ; met `charge_id = null` sur `qonto_transactions` et `receipts_inbox`.
