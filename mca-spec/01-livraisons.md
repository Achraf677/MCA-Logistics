# Onglet — LIVRAISONS

_Version 2 — ajoute la **machine à états gardée** (transitions interdites entre statuts illogiques) et le **calcul automatique du montant** depuis le tarif client. Remplace la spec précédente. Additif — réversible._

## ① Rôle
Cœur opérationnel : enregistrer et piloter les livraisons, de la planification au paiement.
Génère les données qui nourrissent Encaissement, Encours client, Rentabilité, Stats, Dashboard et le push Pennylane.

## ② Parti pris
- Module autonome `features/livraisons/`.
- Drawer **dans la feature** : `features/livraisons/DrawerLivraison.tsx`.
- **Sélection, pas création inline** : on choisit un client/véhicule/chauffeur existant (pas de drawer d'une autre feature importé) — étanchéité garantie.
- **Statut = machine à états** : toute transition passe par `canTransition()` ; aucune mise à jour libre du champ `status`.
- **Montant calculé** depuis le tarif client si `tariff_mode ≠ manuel`, sinon saisi à la main. Stocké en centimes.
- Pas de suppression physique : statut `annulee` (jamais DELETE).

## ③ Données — table `deliveries`
`id` · `company_id` · `ref` · `client_id` · `vehicle_id` · `driver_id` ·
`pickup_address` · `delivery_address` · `scheduled_at` · `delivered_at` ·
`status` (planifiee|en_cours|livree|facturee|payee|annulee) ·
`distance_km` · `pallets` · `amount_ht_cts` · `tva_cts` · `amount_ttc_cts` ·
`invoiced_at` · `paid_at` · `pennylane_invoice_id` · `pennylane_synced_at` ·
`notes` · `created_at` · `updated_at`.

## ④ Sources live (API)
| Sens | Système | Quoi |
|---|---|---|
| Poussé → | Pennylane | À la transition `livree → facturee` : `POST` facture (Factur-X) via Edge Function → stocke `pennylane_invoice_id` |
| Tiré ← | Pennylane | Statut de paiement → peut déclencher `facturee → payee` |

## ⑤ Vue & composants
- **KPIs** : livraisons du mois · CA facturé (€) · en attente de facturation (compte) · en attente de paiement (€).
- **Filtres** : statut / client / véhicule / chauffeur / période (`scheduled_at`).
- **Tableau** : ref · client · date · statut (badge) · montant TTC · actions. Cartes sur mobile.
- **Drawer** `DrawerLivraison` : Détail (formulaire + sélecteurs) / Montant (calcul ou saisie) / Suivi (timeline des statuts + lien Pennylane).
- Les transitions illégales **n'apparaissent pas** dans l'UI (boutons générés depuis `allowedNextStatuses`).

## ⑥ Actions
`actions = ['nouvelle', 'export']`

| Action | Effet |
|---|---|
| + Nouvelle | INSERT `deliveries` (statut `planifiee`) → montant pré-calculé si tarif client |
| Faire avancer | transition gardée via `canTransition()` (ex. Démarrer, Marquer livrée, Facturer, Encaisser) |
| Annuler | `status = annulee` si la transition est permise depuis l'état courant |
| Export | CSV livraisons filtrées |

## ⑦ Logique métier (`livraisons.logic.ts`)
Fonctions **pures** :
- `TRANSITIONS` : graphe des passages autorisés
  `planifiee→{en_cours,annulee}` · `en_cours→{livree,annulee}` · `livree→{facturee}` · `facturee→{payee}` · `payee→{}` · `annulee→{}`.
- `canTransition(from, to)` / `allowedNextStatuses(from)` : pilotent les boutons et bloquent les sauts illogiques (ex. `planifiee→payee` interdit).
- `computeAmount(client, { distance_km, pallets, manual_ht_cts }, tvaRate = 0.20)` :
  - `forfait` → `tariff_rate_cts`
  - `km` → `tariff_rate_cts × distance_km`
  - `palette` → `tariff_rate_cts × pallets`
  - `manuel` → `manual_ht_cts`
  → retourne `{ amount_ht_cts, tva_cts, amount_ttc_cts }`.
- `STATUS_LABELS` / `STATUS_COLORS`.
- Les effets de transition (timestamps `delivered_at`/`invoiced_at`/`paid_at`, push Pennylane) sont **orchestrés dans `livraisons.queries.ts`**, pas ici.

## ⑧ États & cas limites
- `tariff_mode = manuel` ou tarif absent → montant saisi manuellement obligatoire avant `facturee`.
- Tentative de facturer sans montant → bloqué, message clair.
- Pennylane KO à la facturation → statut passe quand même `facturee`, `pennylane_invoice_id` null, entrée `sync_queue` (retry).
- Client/véhicule/chauffeur désactivé → non proposé dans les sélecteurs (livraisons existantes conservées).
- Liste vide → CTA « + Nouvelle livraison ».

## ⑨ Dépendances
- **Nourrit** : Encaissement, Clients (encours), Rentabilité, Statistiques, Dashboard, Pennylane.
- **Consomme** : Clients (`tariff_mode`, `tariff_rate_cts`, `payment_terms`), Véhicules (`vehicle_id`), Équipe (`driver_id`).
- **Partagé** : `shared/lib/money.ts`.
