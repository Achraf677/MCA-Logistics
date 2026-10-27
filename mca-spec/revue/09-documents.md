# 09 — Documents (Système › Documents) — mergé (PR #89, 24/10/2026)

## 0 Convention du Drive et écrans simplifiés (26-27/10/2026, PR #91)
- Source : Google Doc « 📋 CONVENTION DE NOMMAGE & CIRCUIT » (Drive, dossier `A traiter`). Code : `_shared/conventionDocuments.ts` = copie exacte de `src/shared/lib/conventionDocuments.ts` (test octet pour octet).
- Nom : `[AAAA-MM-JJ_]TYPE_TIERS[_NUMERO].ext`, MAJUSCULES, tirets dans un bloc. Date imprimée, sinon date du dépôt, sinon rien (types `intemporel` : KBIS, STATUTS, RIB, CONTRAT, CHARTE, MODELE, CODES-ACCES). Le montant n'est PLUS dans le nom (reste dans la fiche).
- Dossier : `cheminConvention` = tableau « Où je classe » (Clients/<CLIENT>/<AAAA-MM> ; Fournisseurs/<F> ; Vehicules et Flotte/<VEH>/Amendes… ; dossier véhicule retrouvé par la plaque). Sans règle : choix de l'IA parmi les dossiers existants, sinon `A traiter`. Noms alignés sur les dossiers existants (`aligner`).
- Pièces sensibles (identité, permis, casier, Carte Vitale, codes) : reconnues d'après le NOM (`typeSensibleDuNom`), jamais envoyées à l'IA (`lu_via = 'nom'`).
- À confirmer = carte compacte (nom proposé, dossier d'arrivée sur une ligne, Confirmer, Rejeter) ; type / date / tiers / montant / référence / dossier / sous-dossier / alternatives repliés dans « Modifier les détails » ; « Tout ranger (n) » en tête ; documents « sûrs » (`estSur`) en premier avec une coche ; recherche. Inbox = dépôt + un seul geste « Trier (n) » (sans sélection : tout ce que l'IA sait lire).
- « Dis-moi ce que c'est » (carte À confirmer ET baguette dans l'Inbox) : phrase libre → `decrire.logic#analyserDescription` (pur, sans IA : type par mots-clés, tiers = fiche connue sinon texte en MAJUSCULES, date « 5 octobre » / 05/10/2026 / « octobre 2026 » (jour 01), référence = numéro isolé, plaque) → nom + dossier de la convention aussitôt. Dans l'Inbox : `propositionDepuisDescription` + `ecrirePropositionSaisie` (`lu_via = 'saisie'`), le document passe en À confirmer. Type introuvable = message, rien ne change. « facture » = client si le tiers est une fiche client, sinon fournisseur.
- Doublon = même type + date + tiers + référence qu'un document classé (`proposition.doublon_de`).
- **Intelligent / autodidacte (27/10/2026)** :
  - Origine : `origineDuDocument` + `completerDepuisOrigine` (fiche salarié → salarié, fiche véhicule → plaque, fiche client / livraison → client, `uploaded_by` → « déposé par » pour les pièces de salarié seulement) complètent les cases vides, jamais ce que le document ou la phrase dit. Pièces sensibles : salarié = origine d'abord, puis nom du fichier. Feuille / synthèse de tournée : tiers = salarié de la tournée (à défaut déposeur, puis client).
  - Verso / pages : `partie` (VERSO, RECTO, P2, SUITE, ANNEXE) = dernier bloc du nom, lue dans le nom du fichier ou la phrase ; nom déjà pris → VERSO (pièces à deux faces) ou P2, P3… (sauf ticket, photo, amende, tournée : -2).
  - Souple : ordre libre, fautes d'1 lettre sur les mots-clés, abréviations (CT, CG, FDR, BL, LV…), prénom / nom seul s'il est unique, plusieurs dates (la première), montant écrit ignoré dans le nom (va dans la fiche) ; type introuvable → 3 boutons de types proches.
  - Habitudes (sans table : documents `classe`, `drive_chemin`) : `cheminHabituel` (dossier le plus fréquent d'un (type, tiers), dossier AAAA-MM / AAAA suivi, doit exister dans le Drive) passe avant la convention ; `typeHabituel` (≥ 2 documents, 70 %) donne le type quand rien ne le dit ; 25 exemples « type · tiers → dossier » (sans pièces personnelles ni noms de fichier) ajoutés au prompt de l'IA (`exemplesRangement`).
  - Carte À confirmer : libellé discret « Comme d'habitude pour… / Selon la convention / Selon l'origine du document » (`proposition.chemin_via`).
  - Edge `trier-documents` : lit `documents.uploaded_by`, `team_members`, `vehicles`, `clients`, 1 500 derniers classés ; à redéployer après le merge.
- Types nouveaux à ajouter dans le Google Doc : TICKET, FEUILLE-DE-ROUTE, SYNTHESE-TOURNEE, PREUVE-LIVRAISON, ASSURANCE, CAPACITE-TRANSPORT, DPAE, CNI, PERMIS-CONDUIRE, CASIER-JUDICIAIRE, CARTE-VITALE, CODES-ACCES, MODELE, DOCUMENT-VEHICULE, DOCUMENT-SALARIE, DOCUMENT.
- Banc d'essai : `_shared/conventionDocuments.test.ts` et `documents/decrire.logic.test.ts` (données fictives).

- **Bibliothèque : renommer des fichiers DÉJÀ dans le Drive (27/10/2026)** : baguette « Renommer avec l'IA » à gauche des boutons de chaque fichier (panneau : nom proposé modifiable + « Dis-moi ce que c'est » sans IA + Appliquer) ; bouton « Renommer le dossier » en haut (fichiers directs, 100 par passage, paquets de 5, barre + Arrêter, liste de revue ancien → nouveau, cases, « masquer les conformes » par défaut, Appliquer (n), optimiste, échec = ancien nom remis). Edge `drive-renommer-ia` v1 (verify_jwt, droit `systeme.documents/update` + accès Drive ; la lecture IA est partagée avec `trier-documents` via `_shared/lectureDocument.ts`). Le dossier d'origine (Clients/<C>, Fournisseurs/<F>, Vehicules et Flotte/<VEH>, Salaries/<N>) complète tiers / véhicule (`origineDuDossier`) ; `estNomConforme` écarte les noms déjà bons. **Jamais lus par l'IA** : pièces sensibles (nom) et tout fichier sous Sécurité, Direction, Social et RH (chemin relu côté serveur) ; Docs / Sheets / Word / Excel et fichiers > 15 Mo : d'après le nom seulement. Renommage via `drive-rename` existante.

## 1 Rôle
- Un seul endroit pour TOUS les fichiers du site : Inbox → tri par l'IA → confirmation → rangé dans le Drive de la société.
- Rien n'est rangé sans confirmation. La Bibliothèque = le Drive, rien d'autre.

## 2 Qui voit quoi
- Droit `systeme.documents` (président partout) ; le salarié n'y a pas accès.
- Drive : président ou `profiles.drive_access`. Dossier de rangement choisi par le président seulement.
- Un seul compte Google pour tout le site (contact@mcalogistics.fr), connecté dans Paramètres › « Compte Google (Gmail + Drive) » (scopes `gmail.send` + `drive`). Scope Drive refusé → tuile « Drive refusé », Confirmer bloqué.

## 3 L'écran
- Tuiles cliquables : Inbox · À confirmer · Rangés (→ Historique) · Google Drive (→ Bibliothèque). Pastilles : Inbox · À confirmer · Historique · Bibliothèque.
- **Inbox** : dépôt multi-fichiers, recherche, filtre d'origine, « Trier avec l'IA (n) » (lots de 5, Arrêter), suppression, « Retirer les anciens liens Drive ».
- **À confirmer** : carte par document : nom proposé (modifiable), type, date, tiers, montant, référence, champs douteux (< 0,7) surlignés ; « Où le ranger dans le Drive » = liste déroulante avec recherche (dossiers existants + choix de l'IA + « Sinon : … »), « nouveau dossier » signalé, bouton « Créer un sous-dossier ici » ; Confirmer / Rejeter / « Tout confirmer ».
- **Historique** : 60 derniers documents rangés, groupés par jour, avec dossier du Drive, type, montant, « il y a n min », ouverture dans l'appli, lien Drive.
- **Bibliothèque** : Mon Drive, dossiers, fil d'Ariane, recherche par nom dans tout le Drive, aperçu dans l'appli (Docs / Sheets exportés en PDF ; .docx / .xlsx = lien Drive), renommer, « Ranger ici les nouveaux documents ».

## 4 Gestes et écritures
- Confirmer : la carte disparaît aussitôt (`patch` local, aucun rechargement) ; envoi en arrière-plan par paquets de 8 (`rangerDansDrive`) ; échec → la carte revient avec ses corrections. Rejeter : immédiat.
- Edge `drive-ranger` v3 (12 documents au plus par appel) : dossiers résolus une fois, 4 envois en parallèle, écrit `documents` (`drive_file_id`, `drive_url`, `file_name`, métadonnées, `statut_tri = 'classe'`). La page écrit `drive_chemin`.
- Le fichier reste aussi dans Storage (liens des livraisons, tournées).

## 5 Données
- `documents.statut_tri` : `a_trier` (défaut, tous les anciens) → `propose` → `classe`.
- Colonnes : `type_document, date_document, tiers, reference, montant_ttc_cts, resume, proposition (jsonb), trie_le, drive_file_id, drive_url, drive_chemin`. Migrations `20261024110000_documents_tri`, `…120000_documents_drive`, `…130000_documents_drive_chemin` appliquées.
- Dépôt = `entity_type = 'depot'`. Ancien Drive (sans `storage_path`) : visible dans l'Inbox, non triable, purgeable.
- Justificatifs de Finance (`receipts_inbox`) : hors de cet onglet.

## 6 Edge et fichiers
- `trier-documents` v4 : droit `systeme.documents/update`, 6 documents au plus par appel.
  - Image → vision Mistral ; PDF scanné → 3 premières pages ; PDF texte → `_shared/pdfTexte` ; sinon « illisible ».
  - L'IA reçoit clients, fournisseurs, salariés, plaques et l'arborescence réelle du Drive (250 chemins, 4 niveaux) ; elle propose type (22 types), date d'émission, tiers rattaché à la fiche (`rapprocherTiers`), montant, référence, plaque (`rapprocherVehicule`), chemin Drive (confiance < 0,4 → `Dossier/Année`).
  - Nom fabriqué par `_shared/triDocuments#nomPropose`, jamais par l'IA.
  - Feuilles de route, synthèses, photos d'arrêt : rangées d'après la tournée, sans IA (`propositionTournee`, `lu_via = 'tournee'`) ; dossier `Transport / Tournées de colis / Feuilles de route | Synthèses de tournée | Preuves de livraison / AAAA-MM` ; tournée supprimée → date du dépôt.
- Autres Edge : `drive-oauth-start` v17, `drive-status` v12 (champ `drive`), `drive-browse` v14 (dossier / recherche / racine / `arbre`), `drive-fichier` v1, `drive-rename`. Commun : `_shared/googleDrive.ts`.
- Miroir testé : `_shared/triDocuments.ts` ↔ `shared/lib/documentsTri.ts` (types, nom, `cheminDefaut`).
- Front : `src/features/documents/` (Documents, InboxDocuments, ConfirmationTri, HistoriqueDocuments, BibliothequeDocuments, MiniatureDoc, `.logic`, `.queries`).

## 7 Critique / limites
- PDF texte à polices maison : illisible. Pas encore testé sur de vrais fichiers ni sur le vrai Drive.
- Historique : les documents rangés avant le 24/10/2026 n'ont pas de dossier mémorisé.
- Après un déploiement : reconnecter Google (ancien jeton = Gmail seul).

## 8 Lots
- Fait : Inbox, tri IA v2, Drive (Bibliothèque + rangement), tournée sans IA, confirmation instantanée, historique, choix du dossier.
- À venir : aperçu .docx / .xlsx dans l'appli ; sous-dossier par client pour les tournées (si plusieurs clients) ; décider de supprimer ou non la copie Storage après rangement.

## 9 À tester
- Reconnecter Google (cocher Drive), choisir le dossier de rangement, déposer 2-3 fichiers, trier, confirmer, vérifier le Drive et l'Historique.
