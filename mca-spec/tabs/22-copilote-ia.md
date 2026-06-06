# ONGLET — 22 · COPILOTE IA

_Copilote de saisie. Onglet **Système**. Lit une feuille de route (texte OU image/PDF) et
**propose** des livraisons structurées ; l'utilisateur valide et crée. **B1** : ingestion +
extraction (lecture seule). **B2** : validation + création réelle sur clic explicite._

## ① Rôle
Faire gagner du temps de saisie : l'utilisateur importe/colle sa feuille de route, l'IA en extrait
les livraisons (client, adresses, date, montant…) et les affiche en tableau **validable**.
**Règle d'or** : l'IA propose → l'utilisateur édite/coche → **création sur clic explicite uniquement**.

## ② Parti pris
- **Mistral** via Edge Function `ai-extract-deliveries`. Deux briques du même provider :
  - **OCR** (`mistral-ocr-latest`) si l'entrée est une image/PDF → texte markdown.
  - **Structuration JSON** (`mistral-large-latest`, `response_format: json_object`) → livraisons.
- Le front n'appelle QUE `supabase.functions.invoke`. Clé `MISTRAL_API_KEY` côté serveur uniquement.
- **Lecture seule stricte** : aucune écriture base, aucune table, pas de Drawer. Le résultat est
  éphémère (affiché, non persisté).
- **Aucune invention** : un champ absent de la feuille → `null` + listé dans `missing` (affiché
  « à compléter » en orange).

## ② bis — B2 : validation + création
- Le tableau de propositions devient **éditable** : chaque champ est modifiable, chaque ligne a une
  case **[Créer]** (cochée par défaut, **décochée** si la ligne est vide — client+adresses+montant
  tous absents).
- **Matching client** : `<select>` des clients actifs + option « ➕ Créer : {nom} ». Pré-sélection
  d'un client existant si son nom correspond (comparaison normalisée : minuscules, trim, sans
  accents). Sinon « Créer » → nom (éditable) + type du futur client.
- **Chauffeur & véhicule par matching (sans création)** : `<select>` des chauffeurs actifs et des
  véhicules + option « — Non assigné » (= null). Pré-remplis si le nom du chauffeur correspond
  (`full_name` normalisé) ou si le véhicule correspond (`label` normalisé OU plaque normalisée sans
  espaces/tirets). **Jamais bloquant**, **aucune création** : un libellé inconnu reste « Non assigné ».
- **Heure persistée** : `deliveries` n'a pas de colonne heure → l'heure est conservée en préfixe des
  notes (`Heure: {heure} — {notes}`) pour ne pas se perdre.
- **Statut** calculé/affiché en lecture seule : date strictement future → `planifiee`, sinon `livree`.
- **Création** (bouton « Créer les N cochées ») : pour chaque ligne cochée, (a) crée le client si
  « ➕ Créer », (b) crée la livraison. **Séquentiel** : en cas d'échec on s'arrête proprement
  (pas de doublon), toast indiquant le nombre déjà créé. Succès → toast + reset des propositions.

## ③ Données
- **B1** : aucune écriture (lecture seule stricte). Forme d'une livraison proposée :
  `{ client_name, type (medical|ecommerce|retail|particulier|null), date (YYYY-MM-DD|null),
  pickup_address, delivery_address, km, weight_kg, montant_ht_eur, heure, driver_name, vehicle,
  notes, missing[] }`.
- **B2** (écriture uniquement au clic) :
  - `clients` : `company_id, name, type` (tariff_mode prend son défaut `manuel`).
  - `deliveries` : `company_id, client_id, driver_id (null si non assigné), vehicle_id (null si
    non assigné), date, type, pickup_address, delivery_address, km, weight_kg,
    montant_ht_cts (= euros×100), tva_rate = 20, statut, notes (avec l'heure en préfixe)`.
    **Dette des 2 colonnes de montant** : la création remplit AUSSI `amount_*` de façon cohérente
    (`amount_ht_cts = montant_ht_cts`, `tva_cts = round(montant_ht_cts × tva_rate / 100)`,
    `amount_ttc_cts = montant_ht_cts + tva_cts`) — pour que le montant s'affiche correctement
    PARTOUT (Stats/Dashboard lisent `montant_ht_cts` ; drawer facturation + Pennylane lisent
    `amount_*`). **Jamais** `montant_ttc_cts` (colonne GÉNÉRÉE).
  - Pas d'import cross-feature : queries minimales locales via le client supabase partagé (RLS).

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
- B2 : 0 ligne cochée → bouton « Créer » désactivé. `company_id` absent → toast, aucune écriture.
- B2 : ligne « ➕ Créer » sans nom → arrêt propre avec toast (rien créé pour cette ligne et les
  suivantes). Bouton désactivé + spinner pendant la création (anti-double-clic).

## ⑨ Dépendances
- **Consomme** : `_shared/{cors,http}.ts`, `_shared/mistral.ts` (`ocrDocument`, `generateJson`),
  secret `MISTRAL_API_KEY` ; côté front `useProfile` (company_id) et le référentiel `clients`.
- **Partagé** : aucun couplage/​import avec d'autres features (queries clients/livraisons recopiées
  en local).
- **Nourrit** : la base réelle — crée clients + livraisons (statut initial `planifiee`/`livree`),
  qui rejoignent ensuite la machine à états Livraisons.
