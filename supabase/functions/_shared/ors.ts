// Client OpenRouteService — endpoint /optimization (basé sur Vroom).
// La clé n'est jamais logguée (header Authorization). Coordonnées au format [lng, lat].
// Multi-véhicule + capacité : `amount` (job) et `capacity` (véhicule) même dimension.
import { fetchJson } from './http.ts';
const ORS_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization';
export async function optimize(apiKey, jobs, vehicles) {
  return await fetchJson(ORS_OPTIMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey
    },
    body: {
      jobs,
      vehicles,
      options: {
        g: true
      }
    },
    timeoutMs: 30_000
  });
}
