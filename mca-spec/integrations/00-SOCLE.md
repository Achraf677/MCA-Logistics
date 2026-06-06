# INTÉGRATIONS — 00 · SOCLE

_Fondation commune à toutes les intégrations externes (Pennylane, Qonto, Drive, Mistral). À coder UNE fois avant la première intégration. Provider-agnostique._

## ① Rôle
Poser le mécanisme par lequel le site parle aux API externes : Edge Functions Supabase, secrets serveur, gestion d'erreur/retry. Aucune clé d'API ne doit jamais atteindre le navigateur.

## ② Parti pris
- **Tout appel externe = Edge Function** (Deno, côté Supabase). Le front n'appelle QUE `supabase.functions.invoke(<nom>, { body })`.
- Les **secrets** vivent dans Supabase (`supabase secrets set`), lus via `Deno.env.get(...)` dans la fonction. Jamais dans le repo, jamais dans `import.meta.env`.
- L'Edge Function utilise la **service role key** (auto-injectée en env : `SUPABASE_SERVICE_ROLE_KEY`) pour lire/écrire en base côté serveur, en contournant RLS de façon contrôlée.
- **Idempotence** : une fonction qui a déjà poussé une ressource (ex. facture déjà créée) ne doit pas la recréer. On vérifie l'ID externe stocké avant d'agir.
- **Tolérance à la panne** : si l'API externe est KO, on ne bloque pas l'utilisateur. On marque la ligne à resynchroniser et on réessaie plus tard.

## ③ Données
Aucune table nouvelle imposée par le socle. Mécanisme de retry minimal réutilisé de l'existant :
- `deliveries.sync_pending` (boolean) : déjà utilisé par le front à l'échec du push Pennylane.
  → Vérifier que la colonne existe ; sinon mini-migration `add column if not exists sync_pending boolean not null default false` (UP+DOWN).
- Colonnes de liaison externe déjà présentes : `clients.pennylane_id`, `deliveries.pennylane_invoice_id`, `deliveries.pennylane_synced_at`.
- (Optionnel, plus tard) une table générique `integration_sync_queue` si le besoin de retry se généralise au-delà des livraisons. **Pas pour maintenant.**

## ④ Arborescence & conventions Edge Functions
```
supabase/functions/
├── _shared/
│   ├── cors.ts        → en-têtes CORS (invoke depuis le navigateur)
│   ├── supabase.ts    → client service-role (Deno) construit depuis Deno.env
│   └── http.ts        → fetch JSON typé + gestion erreurs API externes
└── <nom-fonction>/
    └── index.ts       → handler Deno.serve, valide le body, agit, répond JSON
```
- Réponse standard : `{ ok: true, data }` ou `{ ok: false, error }` + bon code HTTP.
- CORS : répondre à `OPTIONS` (preflight) et inclure les en-têtes sur toutes les réponses.
- Le client d'API externe (logique Pennylane/Qonto) vit dans `supabase/functions/_shared/<provider>.ts` (et/ou est miroité dans `src/integrations/<provider>.ts` SI une partie est réutilisable côté types — sinon tout reste côté fonction).

## ⑤ Secrets attendus (à définir via `supabase secrets set`)
| Clé | Usage |
|---|---|
| `PENNYLANE_API_TOKEN` | Token entreprise Pennylane (Paramètres → Développeurs) |
| `QONTO_API_KEY` / `QONTO_ORG_SLUG` | Auth Qonto (plus tard) |
| `MISTRAL_API_KEY` | Brouillons IA (moteur Mistral, fournisseur UE) |
| (auto) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injectées par Supabase dans les Edge Functions |

## ⑥ Actions / commandes
- `supabase functions deploy <nom>` → déploiement.
- `supabase secrets set CLE=valeur` → pose d'un secret (jamais commité).
- `supabase functions logs <nom>` → diagnostic.

## ⑦ Logique
Pas de logique métier dans le socle ; il fournit les briques (`_shared/`). La logique propre à chaque provider est dans sa fonction dédiée (voir `01-PENNYLANE.md`).

## ⑧ États & cas limites
- Secret absent → la fonction répond `{ ok:false, error:'missing secret' }` (500), ne crash pas.
- API externe en erreur/timeout → `{ ok:false }` ; l'appelant marque la ligne `sync_pending=true`.
- Body invalide (id manquant) → 400.
- Double appel sur une ressource déjà synchronisée → court-circuit (idempotence), `{ ok:true, alreadySynced:true }`.

## ⑨ Dépendances
- **Nourrit** : toutes les intégrations (Pennylane d'abord), le futur onglet Alertes (échecs de sync).
- **Consomme** : secrets Supabase, service role.
- **Partagé** : `_shared/{cors,supabase,http}.ts`.

## Critère de fin du socle
- `supabase/functions/_shared/{cors,supabase,http}.ts` créés.
- Une fonction de test `ping` (`supabase/functions/ping/index.ts`) déployée, appelable via `supabase.functions.invoke('ping')`, répond `{ ok:true }` avec CORS correct.
- `deliveries.sync_pending` confirmé présent (ou ajouté par mini-migration UP+DOWN).
- Aucun secret dans le repo ; `.gitignore` couvre `supabase/.env*`.
