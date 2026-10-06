// Client OpenRouteService — endpoint /optimization (basé sur Vroom).
// La clé n'est jamais logguée (header Authorization). Coordonnées au format [lng, lat].
// Multi-véhicule + capacité : `amount` (job / shipment) et `capacity` (véhicule) même dimension.
// `shipments` = paires retrait → livraison (lot T4).
import { fetchJson } from './http.ts';
const ORS_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization';
export async function optimize(apiKey, jobs, vehicles, shipments = []) {
  return await fetchJson(ORS_OPTIMIZATION_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey
    },
    body: {
      jobs,
      ...(shipments.length > 0 ? { shipments } : {}),
      vehicles,
      options: {
        g: true
      }
    },
    timeoutMs: 30_000
  });
}
