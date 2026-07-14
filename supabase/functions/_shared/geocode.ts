// Helper de géocodage FR — api-adresse.data.gouv.fr (BAN, officielle, sans clé).
// Utilisé par l'Edge `geocode` (front + backfill) et route-calc (résolution
// des adresses de trajet). Retourne { lat, lng } ou null si introuvable /
// erreur réseau. Ne throw jamais.
const GEO_API = 'https://api-adresse.data.gouv.fr/search'

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
  if (!q) return null
  try {
    const res = await fetch(`${GEO_API}/?q=${encodeURIComponent(q)}&limit=1`)
    if (!res.ok) return null
    const json = await res.json() as { features?: Array<{ geometry?: { coordinates?: unknown[] } }> }
    const coords = json?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    // BAN renvoie [lon, lat] — on normalise en { lat, lng }.
    return { lat: Number(coords[1]), lng: Number(coords[0]) }
  } catch {
    return null
  }
}
