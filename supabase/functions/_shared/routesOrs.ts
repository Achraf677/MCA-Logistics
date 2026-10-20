// Routes réelles pour les tournées express du bureau : matrice ORS (api.heigit.org) et tracé IGN.
// Aucune ligne droite, aucun secours : en cas d'échec une erreur claire est levée / renvoyée et
// l'appelant ne modifie rien. Même méthode que l'Edge `optimiser-tournee-colis`.
import { ExternalApiError, fetchJson } from './http.ts';
import {
  IGN_MAX_POINTS, blocsMatrice, completerMatrices, decoderPolyligne, encoderPolyligne, troncons,
  type Matrices, type Point,
} from './tourneeRoute.ts';

// Adresse officielle (l'ancienne api.openrouteservice.org ferme début 11/2026). Même clé.
const ORS = 'https://api.heigit.org/openrouteservice/v2';
const IGN = 'https://data.geopf.fr/navigation/itineraire';

/** Matrice ORS complète n × n, bloc par bloc (59 × 59 par appel). Lève une erreur si un bloc échoue. */
export async function matriceOrs(cle: string, pts: Point[]): Promise<{ m: Matrices; appels: number }> {
  const n = pts.length;
  const durees: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const distances: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const blocs = blocsMatrice(n);
  for (const b of blocs) {
    const src = pts.slice(b.sources[0], b.sources[1]);
    const dst = pts.slice(b.destinations[0], b.destinations[1]);
    const r = await fetchJson<{ durations?: (number | null)[][]; distances?: (number | null)[][] }>(`${ORS}/matrix/driving-car`, {
      method: 'POST',
      headers: { Authorization: cle },
      body: {
        locations: [...src, ...dst].map(p => [p.lng, p.lat]),
        sources: src.map((_, i) => i),
        destinations: dst.map((_, j) => src.length + j),
        metrics: ['duration', 'distance'],
      },
      timeoutMs: 20_000,
    });
    if (!r?.durations || !r?.distances) throw new Error('matrice ORS incomplète');
    for (let i = 0; i < src.length; i++) {
      for (let j = 0; j < dst.length; j++) {
        durees[b.sources[0] + i][b.destinations[0] + j] = r.durations[i]?.[j] ?? null;
        distances[b.sources[0] + i][b.destinations[0] + j] = r.distances[i]?.[j] ?? null;
      }
    }
  }
  return { m: completerMatrices({ durees, distances }, pts), appels: blocs.length };
}

/** Un tronçon (≤ 17 points) par l'itinéraire IGN (sans clé). null si échec. */
async function tronconIgn(part: Point[]): Promise<Array<[number, number]> | null> {
  const p = (q: Point) => `${q.lng.toFixed(6)},${q.lat.toFixed(6)}`;
  const params = new URLSearchParams({
    resource: 'bdtopo-osrm', profile: 'car', optimization: 'fastest', geometryFormat: 'polyline', getSteps: 'false',
    start: p(part[0]), end: p(part[part.length - 1]),
  });
  if (part.length > 2) params.set('intermediates', part.slice(1, -1).map(p).join('|'));
  try {
    const r = await fetchJson<{ geometry?: string }>(`${IGN}?${params.toString()}`, { timeoutMs: 15_000 });
    return r?.geometry ? decoderPolyligne(r.geometry) : null;
  } catch (e) {
    console.warn('optimize-tours: tracé IGN', (e as Error)?.message, e instanceof ExternalApiError ? JSON.stringify(e.responseBody).slice(0, 300) : '');
    return null;
  }
}

/** Tracé routier d'une tournée (polyligne précision 5), tronçon par tronçon. null si un tronçon échoue. */
export async function tracerIgn(points: Point[]): Promise<string | null> {
  // Deux points identiques à la suite (même adresse) : un seul suffit pour le tracé.
  const pts = points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng);
  if (pts.length < 2) return null;
  const tout: Array<[number, number]> = [];
  for (const [k, part] of troncons(pts, IGN_MAX_POINTS).entries()) {
    const seg = await tronconIgn(part);
    if (!seg) return null;
    tout.push(...(k === 0 ? seg : seg.slice(1)));
  }
  return encoderPolyligne(tout);
}

/** Message prêt à afficher quand les routes sont indisponibles (limite du jour, accès, panne). */
export function messageRoutes(e: unknown): string {
  const brut = e instanceof ExternalApiError ? JSON.stringify(e.responseBody ?? '') : '';
  if (e instanceof ExternalApiError && e.status === 403 && /quota/i.test(brut)) {
    return 'Limite du jour du service de routes atteinte : réessaie demain. Rien n’a été modifié.';
  }
  if (e instanceof ExternalApiError && (e.status === 401 || e.status === 403)) {
    return 'Accès refusé par le service de routes (clé). Rien n’a été modifié.';
  }
  return 'Service de routes indisponible : réessaie dans un moment. Rien n’a été modifié.';
}
