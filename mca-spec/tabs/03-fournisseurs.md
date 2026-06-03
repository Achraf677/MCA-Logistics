# Onglet — FOURNISSEURS

_Version 2 — ajoute la **détection de doublons** (SIREN/SIRET) à la création/modification. Remplace la spec précédente. Additif — réversible._

## ① Rôle
Gérer le référentiel des fournisseurs (carburant, entretien, assurances, télépéage, etc.) : créer, consulter, modifier.
Source des `supplier_id` utilisés dans Charges, Carburant, Entretiens.

## ② Parti pris
- Module autonome `features/fournisseurs/`.
- Drawer **dans la feature** : `features/fournisseurs/DrawerFournisseur.tsx`.
- Pas de suppression physique : `active = false` (soft delete).
- **Pas de push Pennylane** : ce sont eux qui t'envoient des factures, tu ne leur en émets pas. `pennylane_id` renseigné manuellement si rapprochement souhaité.
- **Anti-doublon** à la saisie : un même SIREN ne doit pas exister deux fois. Garde-fou pur, non bloquant si SIREN vide.

## ③ Données — table `suppliers`
`id` · `company_id` · `name` · `siren` · `siret` · `category`
(carburant|entretien|assurance|telepeage|location|autre) · `address` · `city` · `postal_code` ·
`email` · `phone` · `pennylane_id` · `iban` · `notes` · `active` · `created_at` · `updated_at`.

## ④ Sources live (API)
Aucune. Gestion manuelle (rapprochement Pennylane optionnel et manuel).

## ⑤ Vue & composants
- **KPIs** : nb fournisseurs actifs · répartition par catégorie.
- **Filtres** : catégorie / actif / recherche texte (name, siren).
- **Tableau** : name · category · siren · email · phone · actions. Cartes sur mobile.
- **Drawer** `DrawerFournisseur` : 2 sous-vues — Détail (formulaire) / Historique charges.
- À la saisie : **alerte non-bloquante « Doublon possible »** si un SIREN identique existe déjà (lien vers la fiche existante).

## ⑥ Actions
`actions = ['nouveau', 'export']`

| Action | Effet |
|---|---|
| + Nouveau | `findDuplicate` → si doublon, demande confirmation → INSERT `suppliers` |
| Modifier | UPDATE (re-contrôle doublon si SIREN changé) |
| Désactiver | `active = false` (jamais DELETE) |
| Export | CSV liste fournisseurs filtrée |

## ⑦ Logique métier (`fournisseurs.logic.ts`)
Fonctions **pures** :
- `normalizeSiren(v)` : retire espaces/séparateurs, garde 9 chiffres.
- `validateSiren(v)` : 9 chiffres ; `validateSiret(v)` : 14 chiffres.
- `findDuplicate(siren, existing[])` : retourne le fournisseur existant au même SIREN, ou `null`.
- `CATEGORY_LABELS` / `CATEGORY_COLORS` : libellés et badges.

## ⑧ États & cas limites
- SIREN vide → pas de contrôle doublon (autorisé).
- Doublon détecté → **confirmation explicite** avant création (jamais bloqué en dur, pour ne pas coincer un cas légitime).
- Liste vide → CTA « + Nouveau fournisseur ».
- Fournisseur avec charges rattachées → désactivation autorisée mais signalée.

## ⑨ Dépendances
- **Nourrit** : Charges, Carburant, Entretiens.
- **Consomme** : rien (référentiel de base).
- **Partagé** : `shared/lib/money.ts` (si IBAN/montants affichés).
