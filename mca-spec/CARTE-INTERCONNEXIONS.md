# Carte des interconnexions — qui lit / écrit quoi

> À ouvrir AVANT de toucher une table, une colonne, un statut, une Edge ou une règle de calcul
> (CLAUDE.md § 7). À mettre à jour à chaque fin de grosse session (CLAUDE.md § 10).
> Relevée dans le code le 01/10/2026. En cas de doute, le code fait foi :
> `grep -rln "from('<table>')" src supabase/functions`.

## 1. Tables → lecteurs / écrivains
- **deliveries** (le cœur, ~80 accès) :
  - front : livraisons (écrit tout), mescourses (statut, preuves, problème terrain),
    tournees (tour_id, stop_order, arrival_time), planning, calendrier (via livraisons.queries),
    dashboard, encaissement, relances, alertes, clients (encours), equipe, heures, devis
    (crée une course depuis un devis), copilote / assistant (création IA) ;
  - shared : `alertesEngine.queries` (à facturer, sans justificatif, retards), `pod.queries` ;
  - Edge : pennylane-invoice (écrit `facturee`, n° facture, sync_error), pennylane-register-payment
    (`payee`), pennylane-payment-check, send-client-email (email_sent_at), geocode,
    optimize-tour(s).
- **clients** : clients (écrit), livraisons (tarif, délai, TVA intra), devis, modeles,
  encaissement, tresorerie, copilote / assistant ; Edge pennylane-invoice, pennylane-quote,
  pennylane-clients-sync (écrit).
  - colonnes « défauts des courses » (lot B : `pays`, `retrait_*`, `chauffeur_habituel_id`,
    `vehicule_habituel_id`, `prestation_defaut`, `reference_obligatoire`, `supplements`) :
    écrites par la fiche client ; lues par la fiche livraison (`CLIENT_FICHE_COLS`) et
    l'Edge pennylane-invoice (`pays`, `reference_obligatoire`). Non touchées par
    pennylane-clients-sync (upsert de colonnes listées). Libs partagées :
    `shared/lib/pays.ts` (UE, autoliquidation), `shared/lib/supplements.ts`.
- **vehicles / team_members** : flotte (vehicules, carburant, entretiens, inspections, incidents),
  livraisons, tournees, mescourses, equipe, heures, alertes, devis, modeles.
- **documents** (+ Storage `documents`) : `shared/lib/documents.queries` (tous les panneaux
  Documents), mescourses (photos), parametres ; Edge send-client-email (pièce jointe LV),
  drive-migrate-to-storage ; alertes (sans justificatif).
- **charges** : charges, fournisseurs, tresorerie, `shared` rapprochement / aRapprocher / alertes ;
  Edge pennylane-sync, lire-facture, lire-releve, suggest-categorie-ia.
- **tours** : tournees, mescourses ; Edge optimize-tour(s).
- **quotes** : devis, clients ; Edge pennylane-quote ; alertes.
- **qonto_transactions** : tresorerie, encaissement, aRapprocher ; Edge qonto-sync.
- **fuel_logs** : carburant, vehicules, `shared/produitsVehicule.queries`.
- **vehicle_maintenances** : entretiens, vehicules, alertes.
- **profiles / user_permissions** : `app/providers` (rôle, société), toutes les Edge via
  `_shared/auth.ts` (`exigerPermission`), admins ; RLS `has_permission`, `is_president`.

## 2. Colonnes sensibles de `deliveries` et leurs lecteurs
- `statut` : TOUT le monde. Transitions via `shared/lib/livraisonStatuts.ts`. → facturee écrit
  par l'Edge pennylane-invoice uniquement.
- `prestation` (01/10/2026) : fiche livraison (blocs affichés), liste (colonne Trajet via
  `trajetOuReleve`), facture (Edge + aperçu : relevé en quantité). **Filtre « sur la route »**
  `prestation.is.null,prestation.not.in.(messagerie,forfait)` dans : mescourses, tournees,
  planning, dashboard (journée) ; calendrier filtre côté client. Tout NOUVEL écran « terrain »
  doit appliquer ce filtre.
- `nb_colis`, `prix_unitaire_cts` : relevé de messagerie (HT = nb × prix) ; facture en quantité ;
  `nb_colis` aussi écrit par l'onglet Lettre de voiture.
- `expediteur_* / destinataire_* / marchandise_desc / nb_colis / poids_kg_reel` : écrits par la
  fiche ET par l'onglet Lettre de voiture → la fiche ne les réécrit que s'ils ont changé.
- `notes` (consignes chauffeur) → Mes courses. `note_interne` → jamais montré au chauffeur
  (mais lisible par l'API : pas de secret dedans).
- `reference_client` : fiche, en-tête, libellé de facture (Edge + aperçu).
- `creneau_*`, `urgent` : fiche, Mes courses (pastille, créneau de l'arrêt).
- `arrival_time` : écrit par les tournées ; lu par Mes courses, liste, dashboard.
- `amount_ht_cts / tva_cts / amount_ttc_cts / extra_lines / autoliquidation` : fiche,
  liste, aperçu facture, Edge pennylane-invoice, encaissement, dashboard, relances, clients.
- `justif_non_requis`, `pod_captured_at`, `lv_pdf_url` : alerte « sans justificatif »
  (`shared/lib/livraisonsSansJustif`), facturation (avertissement), relevé de messagerie (true).
- `probleme_*` : Mes courses (écrit), liste (filtre Échecs), alertes, dashboard.

## 3. Edge Functions → appelants front
- pennylane-invoice, pennylane-register-payment, pennylane-last-numbers, send-client-email,
  route-calc : **livraisons**
- geocode : livraisons, parametres, tournees · optimize-tour(s) : tournees
- pennylane-quote : devis · pennylane-clients-sync : clients · pennylane-sync,
  suggest-categorie-ia : charges · pennylane-payment-check, qonto-sync : tresorerie
- lire-facture : carburant, entretiens · lire-releve : carburant
- ai-extract-deliveries : copilote, parametres · assistant-chat : assistant ·
  alertes-briefing : alertes · brouillons-generate : brouillons
- admin-users, admin-permissions : admins · drive-* : parametres
- Code commun : `_shared/` (auth, cors, http, pennylane, lignesFacture, money, paymentTerms,
  supabase, mistral, justificatif…). **Modifier un `_shared` = redéployer TOUTES les Edge qui
  l'importent** (lister avec `grep -rl "_shared/<fichier>" supabase/functions`).

## 4. Règles en miroir front ↔ Edge (à modifier des DEUX côtés, tests des deux côtés)
- Lignes de facture : `_shared/lignesFacture.ts` ↔ `features/livraisons/apercuFacture.logic.ts`
  (libellé, référence client, relevé en quantité, autoliquidation, taux légaux).
- Délai de paiement : `_shared/paymentTerms.ts` (`echeanceTransport`, plafond 30 j) ↔
  `shared/lib/paymentTerms.ts` (`conforme`, `delaiConforme`).
- Montants / TVA : `_shared/money.ts` ↔ `shared/lib/money.ts`.

## 5. Imports entre features (exceptions existantes — ne pas en ajouter)
- assistant → presque tout (hub IA).
- planning, calendrier, tournees, dashboard → livraisons (drawer, types, queries).
- livraisons → parametres.
