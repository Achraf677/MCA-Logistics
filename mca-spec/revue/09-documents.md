# 09 — Documents (Système › Documents)

## 1 Rôle
- Un seul endroit pour TOUS les fichiers du site ; l'IA propose un classement et un nom, l'utilisateur confirme.

## 2 Qui voit quoi
- Droit `systeme.documents` (président partout). Le salarié n'y a pas accès.

## 3 L'écran
- Tuiles cliquables : Inbox · À confirmer · Classés · Stockage.
- **Inbox** : zone de dépôt (multi-fichiers), recherche, filtre d'origine, cases, barre « Trier avec l'IA (n) » (lots de 5, Arrêter), suppression, « Retirer les anciens liens Drive ».
- **À confirmer** : une carte par document (nom proposé modifiable, type, date, tiers, montant, référence ; champs douteux surlignés < 0,7), Confirmer / Rejeter, « Tout confirmer ».
- **Bibliothèque** : dossiers (Achats, Ventes, Transport, Banque, Juridique, Flotte, Équipe, Administratif, Autre), recherche, filtres type / année, visionneuse, renommer, « Remettre dans l'Inbox », supprimer. Justificatifs Finance (`receipts_inbox`) en lecture seule.

## 4 Données
- `documents.statut_tri` : `a_trier` (défaut, tous les anciens documents) → `propose` → `classe`.
- Colonnes : `type_document, date_document, tiers, reference, montant_ttc_cts, resume, proposition (jsonb), trie_le`. Migration `20261024110000_documents_tri` appliquée.
- Confirmer = met à jour `file_name` et ces colonnes (le chemin Storage ne change pas).
- Dépôt = `entity_type = 'depot'`.
- Ancien Drive (sans `storage_path`) : visible, non triable, purgeable.

## 5 Edge `trier-documents` (v1, 24/10/2026)
- POST `{ids ≤ 6}`, droit `systeme.documents/update`. Image → vision Mistral ; PDF avec photo → la photo ; PDF texte → `_shared/pdfTexte` ; sinon « illisible ». Nom fabriqué par `_shared/triDocuments#nomPropose` (jamais par l'IA), miroir `shared/lib/documentsTri.ts`.

## 6 Fichiers
- `src/features/documents/` (Documents, InboxDocuments, ConfirmationTri, BibliothequeDocuments, MiniatureDoc, `.logic`, `.queries`).

## 7 Limites connues
- PDF texte à polices maison : illisible. Pas encore testée sur de vrais documents.

## 9 À tester
- Déposer 2-3 fichiers → Trier → corriger / confirmer → les retrouver en Bibliothèque ; purger les liens Drive.
