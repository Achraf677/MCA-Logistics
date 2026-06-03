# Onglet — ÉQUIPE

_Version 2 — ajoute le **suivi des validités chauffeur** (permis B, visite médicale du travail) avec statut apte/à régulariser. Remplace la spec précédente. Colonnes additives nullables — réversible._

## ① Rôle
Gérer les membres de l'équipe (chauffeurs, associés) et leurs **validités réglementaires**.
Source des `driver_id` pour Livraisons, Heures, Planning, Incidents.

## ② Parti pris
- Module autonome `features/equipe/`.
- Drawer **dans la feature** : `features/equipe/DrawerMembre.tsx`.
- Pas de suppression physique : `active = false` (soft delete).
- **Validités portées par la fiche** (dates) → statut calculé par le **helper partagé** `shared/lib/echeances.ts` (le même que Véhicules).
- L'onglet **expose** l'aptitude ; il ne décide pas du planning (c'est Planning qui consomme l'info). Frontière nette.

## ③ Données — table `team_members`
`id` · `company_id` · `profile_id` (lien `profiles` si accès app) · `full_name` ·
`role` (president|dg|chauffeur|comptable) · `contract_type` (cdi|cdd|gerant|externe) ·
`email` · `phone` · `salary_gross_cts` · `hire_date` · `idcc` (défaut '16') ·
`notes` · `active` · `created_at` · `updated_at`.

**Ajouts v2 (colonnes `date` nullables, additives) :**
`licence_b_expiry` (validité permis B) · `medical_visit_expiry` (visite médicale du travail).

## ④ Sources live (API)
Aucune. Gestion manuelle.

## ⑤ Vue & composants
- **KPIs** : nb membres actifs · masse salariale (somme `salary_gross_cts` actifs CDI/CDD) · **chauffeurs à régulariser (compte)**.
- **Filtres** : role / contract_type / actif / **« validité proche/dépassée »**.
- **Tableau** : full_name · role · contract_type · **statut aptitude** (badge) · actions. Cartes sur mobile.
- **Drawer** `DrawerMembre` : 3 sous-vues — Détail / **Validités** (permis + visite médicale, pastilles) / Historique (heures + incidents).

## ⑥ Actions
`actions = ['nouveau', 'export']`

| Action | Effet |
|---|---|
| + Ajouter un membre | INSERT `team_members` |
| Modifier | UPDATE (validités incluses) |
| Désactiver | `active = false` → averti si livraisons futures planifiées |
| Export | CSV équipe (avec colonnes validités) |

## ⑦ Logique métier (`equipe.logic.ts`)
Fonctions **pures** :
- `memberEcheances(member, today)` : applique `shared/lib/echeances.ts` à `licence_b_expiry` et `medical_visit_expiry`.
- `aptitude(member, today)` : `apte` si aucune validité `overdue`, sinon `a_regulariser`. Une validité `none` (date absente) ne dégrade pas l'aptitude.
- `masseSalariale(members)` : somme des `salary_gross_cts` actifs CDI/CDD.
- `ROLE_LABELS` / `CONTRACT_LABELS`.

## ⑧ États & cas limites
- Validité non renseignée → statut `none` (n'affiche pas « à régulariser » à tort).
- Membre avec livraisons futures planifiées → désactivation avec avertissement.
- Vue vide → CTA « + Ajouter un membre ».
- Associé non-chauffeur (president/dg/comptable) → bloc validités masqué (permis/visite non pertinents).

## ⑨ Dépendances
- **Nourrit** : Livraisons (driver_id), Heures, Planning (aptitude), Incidents, **Alertes** (validités proches/dépassées).
- **Consomme** : rien (référentiel de base).
- **Partagé** : `shared/lib/echeances.ts` (avec Véhicules), `shared/lib/money.ts`.
