# 09 — Documents (Système › Documents)

## 1 Rôle
- Un seul endroit pour TOUS les fichiers du site ; l'IA propose un classement et un nom, l'utilisateur confirme.

## 2 Qui voit quoi
- Droit `systeme.documents` (président partout). Le salarié n'y a pas accès.

## 3 L'écran
- Tuiles cliquables : Inbox · À confirmer · Classés · Stockage.
- **Inbox** : zone de dépôt (multi-fichiers), recherche, filtre d'origine, cases, barre « Trier avec l'IA (n) » (lots de 5, Arrêter), suppression, « Retirer les anciens liens Drive ».
- **À confirmer** : une carte par document (nom proposé modifiable, type, date, tiers, montant, référence ; champs douteux surlignés < 0,7), Confirmer / Rejeter, « Tout confirmer ».
- **Bibliothèque** : le Drive de la société, et seulement lui (Mon Drive, navigation par dossiers, fil d'Ariane, recherche par nom dans tout le Drive, ouverture dans l'appli, renommer, lien « Ouvrir dans Google Drive »). Bouton président « Ranger ici les nouveaux documents » = dossier de rangement (`google_drive_tokens.root_folder_id`, défaut « MCA Documents »).
- **Compte Google unique** : connecté dans Paramètres › « Compte Google (Gmail + Drive) » (président / `systeme.parametres`), scopes `gmail.send` + `drive`. Sans le scope Drive accordé : message « Drive refusé », rien ne se range.

## 4 Données
- `documents.statut_tri` : `a_trier` (défaut, tous les anciens documents) → `propose` → `classe`.
- Colonnes : `type_document, date_document, tiers, reference, montant_ttc_cts, resume, proposition (jsonb), trie_le`. Migration `20261024110000_documents_tri` appliquée.
- Confirmer = Edge `drive-ranger` envoie le fichier dans `<racine>/<Dossier>/<Année>/<nom>` du Drive, puis met à jour `file_name` et ces colonnes + `drive_file_id` / `drive_url` (migration `20261024120000_documents_drive`, appliquée). Le fichier reste aussi dans Storage (liens des livraisons, tournées…). Sans Drive : Confirmer désactivé.
- Dépôt = `entity_type = 'depot'`.
- Ancien Drive (sans `storage_path`) : visible dans l'Inbox, non triable, purgeable (les fichiers eux-mêmes se retrouvent dans la Bibliothèque).

## 5 Edge `trier-documents` (v2, 24/10/2026)
- POST `{ids ≤ 6}`, droit `systeme.documents/update`. Image → vision Mistral ; PDF scanné → ses 3 premières photos (pages) ; PDF texte → `_shared/pdfTexte` ; sinon « illisible ».
- L'IA reçoit : clients, fournisseurs, salariés, plaques de la flotte, et l'arborescence RÉELLE du Drive sous le dossier de rangement (jusqu'à 250 chemins, 4 niveaux).
- Elle propose : type (19 types), date d'émission, tiers (rattaché à la fiche connue par `rapprocherTiers`, même nom que la fiche), montant, référence, plaque (`rapprocherVehicule`), et un **chemin Drive** (`chemin`, `chemin_nouveaux` par niveau, `chemin_confiance`, `alternatives` = convention `Dossier/Année` ou `Flotte/Plaque/Année`). Chemin choisi parmi les dossiers existants (`normaliserChemin` reprend leur nom exact) ; confiance < 0,4 → convention par défaut.
- Nom fabriqué par `_shared/triDocuments#nomPropose` (jamais par l'IA), miroir `shared/lib/documentsTri.ts` (types + `cheminDefaut`, testés des deux côtés).
- Écran À confirmer : champ « Où le ranger dans le Drive » (modifiable, pastilles par niveau « nouveau » si le dossier sera créé, bouton « Sinon : … »). Tant que le chemin n'est pas tapé à la main il suit le type, puis l'année suit la date.

## 5b Edge Drive (24/10/2026)
- `drive-oauth-start` v17 (scope drive ajouté), `drive-status` v12 (champ `drive`), `drive-browse` v13 (dossier / recherche / définir racine), `drive-fichier` v1 (octets pour l'aperçu, Docs / Sheets → PDF, 25 Mo), `drive-ranger` v2 (reçoit `chemin: string[]`, crée les dossiers manquants). Code commun `_shared/googleDrive.ts` ; droit = président ou `profiles.drive_access`. `drive-rename` sert au renommage.
- Reconnecter Google après déploiement (ancien jeton = Gmail seul).
