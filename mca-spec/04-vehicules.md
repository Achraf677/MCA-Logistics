# Onglet — VÉHICULES

_Version 2 — ajoute l'**échéancier automatique** (contrôle technique, assurance, révision) avec statut OK/proche/dépassé. Remplace la spec précédente. Colonnes additives nullables — réversible._

## ① Rôle
Gérer la flotte (fiches véhicules, statut, Crit'Air, documents, **échéances réglementaires**).
Source des `vehicle_id` pour Livraisons, Carburant, Entretiens, PRK.

## ② Parti pris
- Module autonome `features/vehicules/`.
- Drawer **dans la feature** : `features/vehicules/DrawerVehicule.tsx`.
- Le kilométrage (`mileage_km`) est mis à jour automatiquement à chaque saisie carburant (si km du plein > km actuel).
- Carte grise dans Supabase Storage (bucket `documents`, chemin `vehicles/{id}/`).
- **Échéances portées par la fiche** (dates) → calcul de statut par un **helper partagé** `shared/lib/echeances.ts` (mutualisé avec Équipe, zéro duplication, zéro import entre features).

## ③ Données — table `vehicles`
`id` · `company_id` · `label` · `plate` · `brand` · `model` · `year` ·
`ptac_kg` (≤ 3500) · `critair` · `fuel_type` · `mileage_km` · `purchase_price_cts` ·
`purchase_date` · `status` (active|maintenance|inactive) · `storage_url` · `notes` ·
`created_at` · `updated_at`.

**Ajouts v2 (colonnes `date` nullables, additives) :**
`ct_expiry` (contrôle technique) · `insurance_expiry` (assurance) · `next_revision_date` (révision constructeur).

## ④ Sources live (API)
Aucune. Gestion manuelle + mise à jour km via Carburant.

## ⑤ Vue & composants
- **KPIs** : nb véhicules actifs · km total flotte · coût carburant mois · **échéances < 30 j (compte)**.
- **Filtres** : status / fuel_type / critair / **« échéance proche/dépassée »**.
- **Cartes véhicule** (vue « garage »). Chaque carte : label, plate, status badge, km, Crit'Air, **pastille échéance** (verte OK / orange < 30 j / rouge dépassée).
- **Drawer** `DrawerVehicule` : 3 sous-vues — Détail (+ bloc Échéances) / Documents / Historique (carburant + entretiens).

## ⑥ Actions
`actions = ['nouveau', 'export']`

| Action | Effet |
|---|---|
| + Nouveau | INSERT `vehicles` |
| Modifier | UPDATE (dates d'échéance incluses) |
| Changer statut | `status = maintenance` ou `inactive` |
| Upload carte grise | Supabase Storage → `storage_url` |
| Export | CSV flotte (avec colonnes échéances) |

## ⑦ Logique métier (`vehicules.logic.ts`)
Fonctions **pures** :
- `validatePtac(kg)` : ≤ 3500 (transport léger, LTI).
- `critairBadge(value)` : couleur (0 vert · 1 violet · 2 jaune · 3 orange · 4-5 rouge).
- `vehicleEcheances(vehicle, today)` : applique `shared/lib/echeances.ts` aux 3 dates → liste `{ label, date, daysLeft, status }`, triée par urgence.
- `worstStatus(echeances)` : pire statut de la flotte/véhicule pour la pastille (`overdue` > `soon` > `ok`).

`shared/lib/echeances.ts` (générique) :
- `computeEcheance(date, today, soonDays = 30)` → `{ daysLeft, status: 'ok'|'soon'|'overdue'|'none' }`.

## ⑧ États & cas limites
- Date d'échéance non renseignée → statut `none` (pas d'alerte, pas de pastille rouge par erreur).
- Vue vide → CTA « + Ajouter un véhicule ».
- Véhicule avec livraisons en cours → passage `inactive` bloqué.
- Upload carte grise : PDF/image, max 10 Mo.

## ⑨ Dépendances
- **Nourrit** : Livraisons, Carburant, Entretiens, Incidents, PRK/Rentabilité, **Alertes** (échéances proches/dépassées), Dashboard.
- **Consomme** : `vehicle_maintenances` (dernier/prochain entretien).
- **Partagé** : `shared/lib/echeances.ts` (avec Équipe), `shared/lib/money.ts`.
