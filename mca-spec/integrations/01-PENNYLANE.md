# INTÉGRATIONS — 01 · PENNYLANE (facturation)

_Émission automatique de la facture client dans Pennylane quand une livraison passe `livree → facturee`. S'appuie sur le SOCLE (00). À coder après le socle._

## ① Rôle
À la transition `livree → facturee` d'une livraison, créer la facture correspondante dans Pennylane à partir des données du site (source de vérité), puis stocker la référence Pennylane sur la livraison. Pennylane reste le système comptable ; le site reste la source des données de livraison.

## ② Parti pris
- Déclenché par l'Edge Function **`pennylane-invoice`** déjà appelée par le front avec `{ delivery_id }` (contrat existant — ne pas le changer).
- **Idempotent** : si `deliveries.pennylane_invoice_id` est déjà renseigné → ne rien recréer, répondre `{ ok:true, alreadySynced:true }`.
- Le **client Pennylane** est résolu via `clients.pennylane_id` ; s'il est absent, on crée le client Pennylane et on stocke l'id en base (rattachement par `external_reference = clients.id`).
- **Montants** : pris tels quels depuis la livraison (déjà réconciliés `ht + tva = ttc`, en centimes). On n'envoie pas un PDF (pas d'import) : Pennylane **génère** la facture depuis des données structurées.
- API **Pennylane v2**. En-tête de migration 2026 activé.

## ③ API Pennylane (faits vérifiés, juin 2026)
- Base URL : `https://app.pennylane.com/api/external/v2`
- Auth : `Authorization: Bearer <PENNYLANE_API_TOKEN>` (token entreprise → Paramètres → Développeurs). Secret côté Edge Function uniquement.
- En-tête à inclure sur chaque requête : `X-Use-2026-API-Changes: true` (nouvelle API ; phase cleanup à partir du 01/07/2026).
- Endpoints utilisés :
  | But | Méthode / route |
  |---|---|
  | Chercher un client par référence | `GET /customers?filter=[{"field":"external_reference","operator":"eq","value":"<clients.id>"}]` |
  | Créer un client société | `POST /company_customers` (body : `name`, `emails`, `external_reference`, `billing_address`) |
  | Créer la facture (brouillon) | `POST /customer_invoices` (customer id + line items + TVA + dates) |
  | Finaliser la facture | endpoint `finalize` de la facture (draft → finalisée, non modifiable ensuite) |
- Montants Pennylane en **euros décimaux** → convertir depuis les centimes via `shared/lib/money.ts` (`centimesToEuros`).

> ⚠️ Le format exact des line items / le nom du champ de finalisation doivent être confirmés sur `https://pennylane.readme.io/v2.0/reference` au moment du build (l'API migre en 2026). La fonction doit logguer la réponse brute en cas d'échec pour ajuster.

## ④ Flux de la fonction `pennylane-invoice`
1. Valider `delivery_id` (sinon 400).
2. Charger la livraison (service role). Si `pennylane_invoice_id` déjà présent → `{ ok:true, alreadySynced:true }`.
3. Charger le client lié.
4. **Résoudre le client Pennylane** : si `client.pennylane_id` null → `GET /customers?filter=external_reference` ; si absent → `POST /company_customers` ; stocker l'id dans `clients.pennylane_id`.
5. **Créer la facture brouillon** `POST /customer_invoices` : client id, date = `invoiced_at` (ou jour), 1 line item (libellé = réf/description livraison, montant HT = `amount_ht_cts` en €, taux/montant TVA cohérent avec `tva_cts`), devise EUR.
6. **Finaliser** la facture.
7. Écrire sur la livraison : `pennylane_invoice_id`, `pennylane_synced_at = now()`, `sync_pending = false`.
8. Répondre `{ ok:true, data:{ pennylane_invoice_id } }`.
- Toute erreur réseau/API → `{ ok:false, error }` (l'appelant met `sync_pending=true`). Ne pas finaliser si la création échoue.

## ⑤ Re-synchronisation (rattrapage)
- Fonction/déclencheur `pennylane-resync` : reprend les `deliveries` où `statut='facturee' AND sync_pending=true AND pennylane_invoice_id IS NULL` et rejoue le flux. Appelable manuellement (bouton « Resynchroniser » côté Livraisons) ou planifiée.

## ⑥ Sécurité
- `PENNYLANE_API_TOKEN` uniquement en secret Supabase, lu via `Deno.env`. Jamais dans le repo ni le front.
- La fonction n'expose jamais le token ni la réponse brute Pennylane au client (seulement `{ ok, data|error }`).

## ⑦ Cas limites
- Client sans email/SIRET → Pennylane peut refuser : remonter l'erreur claire, `sync_pending=true`, ne pas boucler.
- Montant manuel/TVA surchargée : on envoie les montants de la livraison tels quels (déjà réconciliés).
- Livraison annulée après facturation : hors périmètre ici (gérer l'avoir plus tard via credit note).
- Double clic / double invoke : protégé par l'idempotence (étape 2).

## ⑧ Dépendances
- **Nourrit** : Encaissement/Qonto (rapprochement paiement), Dashboard.
- **Consomme** : SOCLE (`_shared/`), `deliveries`, `clients.pennylane_id`, `shared/lib/money.ts`.
- **Partagé** : client Pennylane dans `supabase/functions/_shared/pennylane.ts`.

## Critère de fin
- `supabase/functions/pennylane-invoice/index.ts` déployée.
- Une livraison réelle passée `livree → facturee` crée une facture finalisée dans Pennylane, et `pennylane_invoice_id` + `pennylane_synced_at` sont renseignés ; `sync_pending=false`.
- Re-passage sur la même livraison → `alreadySynced` (pas de doublon).
- Token absent ou API KO → la livraison reste utilisable, `sync_pending=true`, message clair.
