# Onglet — CLIENTS

_Version 2 — ajoute le **tarif client** (source du montant auto des livraisons) et le **suivi d'encours/paiement**. Remplace la spec précédente. Tout est additif et nullable — réversible._

## ① Rôle
Gérer le référentiel des clients (donneurs d'ordre) : créer, consulter, modifier.
C'est la source des `client_id`, du **tarif** et des **délais de paiement** utilisés dans Livraisons, Encaissement, Rentabilité.

## ② Parti pris
- Module autonome `features/clients/`.
- Drawer **dans la feature** : `features/clients/DrawerClient.tsx` (plus dans `shared/drawers/` — étanchéité). Aucune autre feature ne l'importe.
- Pas de suppression physique : `active = false` (soft delete).
- **Tarif client** porté par la fiche client (pas de table à part) — simple, réversible.
- **Encours = donnée calculée, jamais stockée** : dérivée des Livraisons. Aucune désynchronisation possible.
- Helper partagé `shared/lib/money.ts` pour le format des montants (centimes → €).

## ③ Données — table `clients`
`id` · `company_id` · `name` · `siret` · `tva_intra` · `address` · `city` · `postal_code` ·
`email` · `phone` · `type` (medical|ecommerce|retail|particulier) · `pennylane_id` ·
`payment_terms` (jours, défaut 30) · `notes` · `active` · `created_at` · `updated_at`.

**Ajouts v2 (colonnes nullables, additives) :**
`tariff_mode` (forfait|km|palette|manuel, défaut `manuel`) ·
`tariff_rate_cts` (centimes : prix forfait, prix/km, ou prix/palette selon le mode).

## ④ Sources live (API)
| Sens | Système | Quoi |
|---|---|---|
| Poussé → | Pennylane | `POST /company_customers` à la création/modification (si SIRET renseigné) — via Edge Function |
| Tiré ← | Pennylane | `pennylane_id` récupéré après création pour référence future |

## ⑤ Vue & composants
- **KPIs** : nb clients actifs · répartition par type (4 badges) · **encours total** (€ facturé non payé, tous clients) · **dont en retard**.
- **Filtres** : type / actif / recherche texte (name, siret) / **« avec encours »**.
- **Tableau** : name · type · siret · payment_terms · **encours** · **statut paiement** · actions. Cartes sur mobile.
- **Drawer** `DrawerClient` : 3 sous-vues — Détail (formulaire + tarif) / Historique livraisons / **Encours & paiements**.

## ⑥ Actions
`actions = ['nouveau', 'export']`

| Action | Effet |
|---|---|
| + Nouveau | formulaire → INSERT `clients` → push Pennylane si SIRET |
| Modifier | UPDATE → sync Pennylane si `pennylane_id` existe |
| Désactiver | `active = false` (jamais DELETE) → bloqué si livraisons actives |
| Export | CSV liste clients filtrée (avec colonne encours) |

## ⑦ Logique métier (`clients.logic.ts`)
Fonctions **pures** (aucun accès DB, aucun DOM) :
- `validateSiret(siret)` : 14 chiffres avant push Pennylane.
- `getTariffLabel(client)` : libellé lisible du mode tarifaire.
- `computeEncours(deliveries)` : somme `amount_ttc_cts` des livraisons `facturee` non `payee`. Retourne `{ total_cts, overdue_cts, count }`.
- `paymentStatusOf(delivery, today)` : `a_jour` | `du` | `en_retard` à partir de `invoiced_at + payment_terms`.
- Le calcul du montant d'une livraison **n'est pas ici** : il vit dans `livraisons.logic.ts` (`computeAmount`), qui consomme `tariff_mode`/`tariff_rate_cts`. Frontière nette.

## ⑧ États & cas limites
- Pennylane KO → client créé en base, `pennylane_id` null, entrée en `sync_queue`.
- Liste vide → CTA « + Nouveau client ».
- Client avec livraisons actives → désactivation bloquée, message clair.
- `tariff_mode = manuel` → le montant de chaque livraison est saisi à la main (pas de calcul auto).

## ⑨ Dépendances
- **Nourrit** : Livraisons (tarif + payment_terms), Encaissement, Rentabilité, Dashboard.
- **Consomme** : Livraisons (pour l'encours calculé — lecture seule).
- **Partagé** : `shared/lib/money.ts`. (Le drawer n'est plus partagé.)
