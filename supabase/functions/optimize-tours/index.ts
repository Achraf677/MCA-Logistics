// Edge Function `optimize-tours` — RETIRÉE (refonte Planning du 22/10/2026).
// L'express n'a plus de composeur de tournées : l'onglet Tournées ne gère que les tournées de colis
// (Edge `optimiser-tournee-colis`). Cette version ne fait plus rien : elle répond 410 à tout appel.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  return jsonResponse({ ok: false, error: 'optimize-tours est retirée : les tournées express ne sont plus composées dans le site.' }, 410);
});
