# 09 — Documents (Système › Documents) — mergé (PR #89, 24/10/2026)

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
