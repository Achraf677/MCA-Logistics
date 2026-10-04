// Edge Function `optimize-tour` — RETIRÉE (lot T1, revue 04a du 04/10/2026).
// L'écran Tournées passe par `optimize-tours` (multi-véhicule, droits vérifiés).
// Cette version ne fait plus rien : elle répond 410 à tout appel, pour qu'aucun
// compte ne puisse réécrire une tournée par ce chemin sans contrôle.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  return jsonResponse({ ok: false, error: 'optimize-tour est retirée : utilisez optimize-tours.' }, 410);
});
