# ONGLET — 22 · COPILOTE IA

_Copilote de saisie. Onglet **Système**. Lit une feuille de route (texte OU image/PDF) et
**propose** des livraisons structurées à l'écran. **Brique B1** : ingestion + extraction,
**lecture seule stricte** — rien n'est écrit en base, aucune livraison n'est créée._

## ① Rôle
Faire gagner du temps de saisie : l'utilisateur importe/colle sa feuille de route, l'IA en extrait
les livraisons (client, adresses, date, montant…) et les affiche sous forme de tableau de
propositions. La création réelle est l'affaire de **B2** (à venir).

## ② Parti pris
- **Mistral** via Edge Function `ai-extract-deliveries`. Deux briques du même provider :
  - **OCR** (`mistral-ocr-latest`) si l'entrée est une image/PDF → texte markdown.
  - **Structuration JSON** (`mistral-large-latest`, `response_format: json_object`) → livraisons.
- Le front n'appelle QUE `supabase.functions.invoke`. Clé `MISTRAL_API_KEY` côté serveur uniquement.
- **Lecture seule stricte** : aucune écriture base, aucune table, pas de Drawer. Le résultat est
  éphémère (affiché, non persisté).
- **Aucune invention** : un champ absent de la feuille → `null` + listé dans `missing` (affiché
  « à compléter » en orange).

## ③ Données
Aucune table. Aucune requête base. La fonction ne lit ni n'écrit Postgres (lecture seule stricte).
Forme d'une livraison proposée :
`{ client_name, type (medical|ecommerce|retail|particulier|null), date (YYYY-MM-DD|null),
pickup_address, delivery_address, km, weight_kg, montant_ht_eur, heure, notes, missing[] }`.

## ④ RGPD / UE
- Le document (texte, image ou PDF) est envoyé à **Mistral (UE)** pour OCR + structuration.
  L'API Mistral ne réentraîne pas ses modèles sur les données envoyées (no-train).
- Clé API jamais exposée au navigateur ni logguée (header `Authorization` côté Edge).
- Note visible dans l'UI invitant à ne pas inclure de données ultra-sensibles non nécessaires.

## ⑤ Secrets
| Clé | Usage |
|---|---|
| `MISTRAL_API_KEY` | Mistral — OCR (`/ocr`) + structuration (`/chat/completions`) |

## ⑥ Actions / commandes
- Importer un fichier (image/PDF, ~8 Mo max) **ou** coller le texte → ajouter des précisions →
  **Analyser** → tableau de propositions.
- `supabase functions deploy ai-extract-deliveries` ; `supabase secrets set MISTRAL_API_KEY=…`.

## ⑦ Logique
- Edge `ai-extract-deliveries` : si fichier → `ocrDocument` (data-URL, `document_url`/`image_url`
  selon PDF/image) ; sinon texte collé. Puis `generateJson` avec le `systemPrompt` d'extraction.
  Renvoie `{ ok:true, data:{ deliveries, raw_text } }`.
- Front : lit le fichier en base64 (`FileReader.readAsDataURL`, préfixe `data:` retiré), affiche
  le tableau, surligne en orange les champs `null`/`missing`.

## ⑧ États & cas limites
- Ni texte ni fichier → 400 `text or file required` (front : bouton désactivé).
- `MISTRAL_API_KEY` absente → 500.
- Fichier > ~8 Mo → refusé côté front (toast), pas d'appel.
- OCR/structuration en erreur ou JSON invalide → 502 (ou 500), toast côté front.
- `deliveries` vide → état vide (« aucune livraison détectée »).

## ⑨ Dépendances
- **Consomme** : `_shared/{cors,http}.ts`, `_shared/mistral.ts` (`ocrDocument`, `generateJson`),
  secret `MISTRAL_API_KEY`.
- **Partagé** : aucun couplage avec d'autres features.
- **Nourrit** : **B2** (à venir) — matching client (référentiel Clients), validation manuelle,
  puis création réelle des livraisons (machine à états Livraisons).
