# DÉMARCHE v2 — Intégration approfondissement métier (pilotage Claude Code)

Ce fichier dit à Claude Code **quoi faire, dans quel ordre, et quand s'arrêter**.
Une étape = une session. `/clear` entre chaque. Une seule tâche à la fois.

## Règle d'or (rappel)
> On ne dit jamais « intègre tout ». On dit « fais CETTE étape, en lisant CES fichiers,
> et arrête-toi quand CE critère est vrai ». Si une info manque → **demander**, ne pas inventer.

## Contenu de ce lot (à placer dans `mca-spec/tabs/`)
- `01-livraisons.md` · `02-clients.md` · `03-fournisseurs.md` · `04-vehicules.md` · `05-equipe.md` (specs **v2**, remplacent les actuelles)
- `MIGRATION-v2-deltas.md` (deltas SQL réversibles)

## Ordre des étapes (dépendances en cascade)
0. Intégrer les fichiers → 1. Étanchéité (drawers) → 2. Migration deltas → 3. Helpers partagés → 4. Clients → 5. Véhicules → 6. Équipe → 7. Livraisons → 8. Fournisseurs (dédup).

---

## Étape 0 — Intégration des fichiers (manuel, pas de code)
Dézippe ce lot dans `mca-spec/tabs/` en **écrasant** les versions précédentes des onglets 01–05.
Vérifie que `MIGRATION-v2-deltas.md` est bien présent. Puis ouvre une session Claude Code.

---

## Étape 1 — Réparer l'étanchéité (drawers) — *prérequis des specs v2*
Les specs v2 supposent chaque drawer **dans sa feature**. Cette étape corrige le couplage actuel.

```
Lis : mca-spec/01-ARCHITECTURE.md, src/app/routes.tsx,
src/shared/drawers/DrawerClient.tsx, DrawerVehicule.tsx, DrawerLivraison.tsx,
src/features/clients/clients.logic.ts.

Tâche unique : refactor d'étanchéité.
1. Déplace les drawers spécifiques dans leur feature :
   shared/drawers/DrawerClient.tsx    -> features/clients/DrawerClient.tsx
   shared/drawers/DrawerVehicule.tsx  -> features/vehicules/DrawerVehicule.tsx
   shared/drawers/DrawerLivraison.tsx -> features/livraisons/DrawerLivraison.tsx
   Corrige les imports : '../ui/...' -> '../../shared/ui/...' ; '../../features/<x>/...' -> './<x>...' ;
   '../../app/providers' inchangé. Mets à jour toutes les références (Clients.tsx, etc.).
   Supprime shared/drawers/ si vide.
2. Crée src/shared/lib/download.ts (downloadCSV, code DOM) et retire downloadCSV de clients.logic.ts.
3. Échappe filters.search avant interpolation dans les .or(ilike) (clients, fournisseurs, vehicules, equipe, livraisons).
4. Supprime le dossier fantôme Cmcadev/ à la racine.

Hors périmètre : aucune migration, aucune Edge Function, aucun redesign, aucune logique métier modifiée.

Arrête-toi quand : `npm run build` passe ;
`grep -rn "from '../../features" src/shared/` ne renvoie rien ;
`npm run dev` démarre et les drawers Clients/Véhicules/Livraisons s'ouvrent.
Récapitule les fichiers déplacés/modifiés/supprimés.
```

---

## Étape 2 — Appliquer la migration deltas v2
```
Lis : mca-spec/tabs/MIGRATION-v2-deltas.md.

Tâche unique : appliquer les deltas sur le projet Supabase v2 (pzfgtcugmqeqixogwzcu).
1. Crée supabase/migrations/20260603120000_v2_deltas.sql avec le bloc UP.
2. Crée le fichier .down.sql avec le bloc DOWN.
3. Applique la migration UP (status reste en text : NE PAS créer d'enum).
4. Lance la requête de vérification du fichier et montre-moi le résultat.

Hors périmètre : aucun code front, aucune Edge Function.
Arrête-toi quand : la vérification retourne 12 colonnes (tariff_mode NOT NULL défaut 'manuel', les 11 autres nullables).
```

---

## Étape 3 — Helpers partagés (échéances + argent)
```
Lis : mca-spec/tabs/04-vehicules.md (§⑦), 05-equipe.md (§⑦), 02-clients.md (§②).

Tâche unique : créer deux helpers purs, testables, sans dépendance à une feature.
- src/shared/lib/echeances.ts :
    export type EcheanceStatus = 'ok'|'soon'|'overdue'|'none'
    export function computeEcheance(date: string|null, today = new Date(), soonDays = 30):
      { daysLeft: number|null; status: EcheanceStatus }
- src/shared/lib/money.ts :
    centimes <-> euros, format FR (ex. 1234567 -> "12 345,67 €"), addTva(ht_cts, rate).

Hors périmètre : ne touche à aucune feature.
Arrête-toi quand : les deux fichiers compilent et un test rapide de computeEcheance/format passe.
```

---

## Étape 4 — Clients v2 (tarif + encours)
```
Lis : mca-spec/01-ARCHITECTURE.md, 02-DESIGN-SYSTEM.md, 09-FRONTEND-UX.md,
mca-spec/tabs/02-clients.md, src/shared/lib/money.ts.

Tâche unique : mettre l'onglet Clients au niveau de sa spec v2.
- Étends clients.types.ts (tariff_mode, tariff_rate_cts).
- Ajoute dans clients.logic.ts (pur) : getTariffLabel, computeEncours, paymentStatusOf.
- DrawerClient : 3e sous-vue « Encours & paiements » + champs tarif dans Détail.
- KPIs : encours total + dont en retard. Filtre « avec encours ».
Ne touche à aucun autre onglet (l'encours lit les livraisons en lecture seule via une query dédiée).
Arrête-toi quand : build OK, onglet Clients affiche tarif + encours, et le mode 'manuel' n'exige pas de tarif.
```

---

## Étape 5 — Véhicules v2 (échéancier)
```
Lis : mca-spec/tabs/04-vehicules.md, src/shared/lib/echeances.ts.

Tâche unique : échéancier automatique.
- Étends vehicules.types.ts (ct_expiry, insurance_expiry, next_revision_date).
- vehicules.logic.ts (pur) : vehicleEcheances (via shared/lib/echeances), worstStatus.
- Carte véhicule : pastille (vert/orange/rouge). Bloc « Échéances » dans le drawer. KPI « < 30 j ».
Ne touche à aucun autre onglet.
Arrête-toi quand : build OK, pastilles correctes, date absente => statut 'none' (pas de rouge à tort).
```

---

## Étape 6 — Équipe v2 (validités)
```
Lis : mca-spec/tabs/05-equipe.md, src/shared/lib/echeances.ts.

Tâche unique : validités chauffeur.
- Étends equipe.types.ts (licence_b_expiry, medical_visit_expiry).
- equipe.logic.ts (pur) : memberEcheances, aptitude (apte|a_regulariser), masseSalariale.
- Drawer : sous-vue « Validités ». Badge aptitude au tableau. KPI « à régulariser ».
- Bloc validités masqué pour les rôles non-chauffeur.
Ne touche à aucun autre onglet.
Arrête-toi quand : build OK, aptitude juste, validité absente => n'affiche pas « à régulariser ».
```

---

## Étape 7 — Livraisons v2 (machine à états + montant auto)
```
Lis : mca-spec/tabs/01-livraisons.md, 02-clients.md (tarif), src/shared/lib/money.ts.

Tâche unique : fiabiliser Livraisons.
- livraisons.logic.ts (pur) : TRANSITIONS, canTransition, allowedNextStatuses, computeAmount (TVA 0.20).
- livraisons.queries.ts : orchestration des transitions (timestamps delivered_at/invoiced_at/paid_at).
  À la transition livree->facturee : push Pennylane via Edge Function SI elle existe, sinon sync_queue.
- DrawerLivraison : sélecteurs client/véhicule/chauffeur (sélection, PAS de création inline),
  bloc Montant (calcul si tarif, sinon saisie), timeline des statuts.
- Boutons d'action générés depuis allowedNextStatuses (les transitions interdites n'apparaissent pas).
Ne touche à aucun autre onglet.
Arrête-toi quand : build OK ; impossible de sauter un état (ex. planifiee->payee) ;
facturation bloquée si montant absent ; client/véhicule désactivé non proposé.
```

---

## Étape 8 — Fournisseurs v2 (anti-doublon)
```
Lis : mca-spec/tabs/03-fournisseurs.md.

Tâche unique : dédoublonnage à la saisie (logique pure, pas de migration).
- fournisseurs.logic.ts : normalizeSiren, validateSiren/Siret, findDuplicate.
- À la création/modif : si SIREN identique existe, alerte non-bloquante + confirmation + lien fiche.
Ne touche à aucun autre onglet.
Arrête-toi quand : build OK ; doublon SIREN détecté et confirmable ; SIREN vide => pas de contrôle.
```

---

## Garde-fous valables à TOUTES les étapes
- Respecter `01-ARCHITECTURE` : aucun import entre `features/` ; calculs dans `*.logic.ts` ; UI depuis `shared/`.
- Respecter `02-DESIGN-SYSTEM` (tokens, boutons 32px sobres) et `09-FRONTEND-UX` (états loading/vide/erreur, cartes sous `md`).
- Une étape ne modifie qu'**un** dossier `features/` (sauf étapes 0-3, transverses).
- Brancher chaque étape sur sa propre branche Git (`feat/v2-clients`, etc.). Si ça part de travers, on jette la branche.
- Critère de fin atteint => **stop**. Ne pas enchaîner sur l'étape suivante sans validation.
