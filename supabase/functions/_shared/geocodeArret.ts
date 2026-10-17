// Géocodage d'un arrêt de tournée de colis — BAN (api-adresse.data.gouv.fr, sans clé).
//
// Même service que `_shared/geocode.ts`, mais on a besoin de savoir CE QUI a été trouvé :
//   - le numéro exact (`type = housenumber`) → `geo_precision = 'numero'` ;
//   - sinon le centre de la rue (`type = street`) → `geo_precision = 'rue'` ;
//   - sinon rien (jamais la seule commune : un point au centre-ville tromperait le tri).
// Fichier séparé pour ne pas changer le comportement de `geocode()` (lu par geocode,
// route-calc, optimize-tours). `choisirResultat` est pur et testé.

const GEO_API = 'https://api-adresse.data.gouv.fr/search/'

/** En dessous, la BAN a « trouvé » autre chose que l'adresse demandée. */
export const SCORE_MIN = 0.5

export interface PointArret {
  lat: number
  lng: number
  precision: 'numero' | 'rue'
}

interface FeatureBan {
  geometry?: { coordinates?: unknown[] }
  properties?: { type?: string; score?: number; postcode?: string; city?: string }
}

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

/**
 * Premier résultat acceptable : bon type, score suffisant, et même code postal (ou même
 * commune si la feuille n'a pas de CP). Pur.
 */
export function choisirResultat(
  features: FeatureBan[] | undefined,
  attendu: { type: 'housenumber' | 'street'; cp: string | null; commune: string | null },
): { lat: number; lng: number } | null {
  for (const f of features ?? []) {
    const p = f.properties ?? {}
    if (p.type !== attendu.type) continue
    if (typeof p.score !== 'number' || p.score < SCORE_MIN) continue
    if (attendu.cp && p.postcode && p.postcode !== attendu.cp) continue
    if (!attendu.cp && attendu.commune && p.city && normaliser(p.city) !== normaliser(attendu.commune)) continue
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const lng = Number(c[0]); const lat = Number(c[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    return { lat, lng }
  }
  return null
}

async function interroger(q: string, type: 'housenumber' | 'street', cp: string | null): Promise<FeatureBan[] | undefined> {
  const params = new URLSearchParams({ q, type, limit: '3' })
  if (cp) params.set('postcode', cp)
  try {
    const res = await fetch(`${GEO_API}?${params.toString()}`)
    if (!res.ok) return undefined
    const json = await res.json() as { features?: FeatureBan[] }
    return json.features
  } catch {
    return undefined
  }
}

/** Numéro, sinon centre de la rue, sinon null. Ne lève jamais. */
export async function geocoderArret(a: {
  numero: string | null; rue: string | null; cp: string | null; commune: string | null
}): Promise<PointArret | null> {
  if (!a.rue || (!a.cp && !a.commune)) return null
  const lieu = [a.cp, a.commune].filter(Boolean).join(' ')
  if (a.numero && /\d/.test(a.numero)) {
    const f = await interroger(`${a.numero} ${a.rue} ${lieu}`, 'housenumber', a.cp)
    const r = choisirResultat(f, { type: 'housenumber', cp: a.cp, commune: a.commune })
    if (r) return { ...r, precision: 'numero' }
  }
  const f = await interroger(`${a.rue} ${lieu}`, 'street', a.cp)
  const r = choisirResultat(f, { type: 'street', cp: a.cp, commune: a.commune })
  return r ? { ...r, precision: 'rue' } : null
}
