// Géocodage / autocomplétion d'adresse via Photon (Komoot / OpenStreetMap).
// Service UE, sans clé API, appelable directement depuis le front.
// Ce module est PUR : il ne fait que parser la réponse GeoJSON de Photon.
// L'appel réseau (fetch) reste dans le composant AddressAutocomplete.

/** Une suggestion d'adresse normalisée, prête à stocker. */
export interface AddressSuggestion {
  /** Libellé lisible, ex. « 12 Rue de la Gare, 67000 Strasbourg ». */
  address: string
  lat: number
  lng: number
}

// ── Types partiels de la réponse Photon (GeoJSON) ─────────────────────────────

interface PhotonProperties {
  name?: string
  housenumber?: string
  street?: string
  postcode?: string
  city?: string
  state?: string
  country?: string
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] } // [lng, lat]
  properties?: PhotonProperties
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

/**
 * Construit un libellé lisible à partir des propriétés Photon.
 * Adresse précise → « <housenumber> <street>, <postcode> <city> ».
 * Lieu nommé (POI, ville) → « <name>, <postcode> <city> » sans dupliquer la ville.
 */
function formatLabel(p: PhotonProperties): string {
  // Ligne 1 : numéro + rue, sinon le nom du lieu.
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ').trim() || p.name || ''
  // Ligne 2 : code postal + ville.
  const line2 = [p.postcode, p.city].filter(Boolean).join(' ').trim()

  // Évite « Strasbourg, 67000 Strasbourg » quand name == city sans rue.
  if (line1 && line2 && line1 !== p.city) return `${line1}, ${line2}`
  if (line1 && line2 && line1 === p.city) return line2
  return line1 || line2
}

/**
 * Parse une réponse Photon en suggestions normalisées.
 * Ignore les features sans coordonnées valides ou sans libellé exploitable.
 */
export function parsePhotonResponse(json: unknown): AddressSuggestion[] {
  const features = (json as PhotonResponse)?.features
  if (!Array.isArray(features)) return []

  const out: AddressSuggestion[] = []
  for (const f of features) {
    const coords = f?.geometry?.coordinates
    if (!coords || coords.length < 2) continue
    const [lng, lat] = coords
    if (typeof lat !== 'number' || typeof lng !== 'number') continue

    const address = formatLabel(f?.properties ?? {})
    if (!address) continue

    out.push({ address, lat, lng })
  }
  return out
}

/** URL de l'endpoint Photon, biaisée vers Strasbourg / Alsace. */
export function photonUrl(query: string): string {
  const q = encodeURIComponent(query)
  return `https://photon.komoot.io/api/?q=${q}&lang=fr&limit=5&lat=48.58&lon=7.75`
}
