// Helper de géocodage FR — api-adresse.data.gouv.fr (BAN, officielle, sans clé).
// Utilisé par l'Edge `geocode` (front + backfill) et route-calc (résolution
// des adresses de trajet). Retourne { lat, lng } ou null si introuvable /
// erreur réseau. Ne throw jamais.
//
// Repli progressif : si l'adresse complète ne matche pas (score faible ou
// zéro résultat), on retente sans le n° de rue, puis en "code postal + ville"
// seulement. Objectif : localiser AU PIRE la ville (utile pour un dépôt / une
// livraison mal saisie), plutôt que retourner null et bloquer l'optim de
// tournée. Aucun seuil de score strict côté client : BAN classe déjà par
// pertinence et on prend le meilleur match.
const GEO_API = 'https://api-adresse.data.gouv.fr/search'

async function tryQuery(q: string): Promise<{ lat: number; lng: number } | null> {
  if (!q) return null
  try {
    const res = await fetch(`${GEO_API}/?q=${encodeURIComponent(q)}&limit=1`)
    if (!res.ok) return null
    const json = await res.json() as {
      features?: Array<{ geometry?: { coordinates?: unknown[] } }>
    }
    const coords = json?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    // BAN renvoie [lon, lat] — on normalise en { lat, lng }.
    return { lat: Number(coords[1]), lng: Number(coords[0]) }
  } catch {
    return null
  }
}

/** Repli 1 : enlève le n° de rue de tête (« 17 rue X, 67540 Y » → « rue X, 67540 Y »). */
function stripHouseNumber(q: string): string {
  return q.replace(/^\s*\d+\s*(bis|ter|quater)?[\s,]+/i, '').trim()
}

/** Repli 2 : garde uniquement CP + ville (5 chiffres + reste après la virgule). */
function postcodeCity(q: string): string {
  const m = q.match(/(\d{5})\s+([^,]+)$/)
  if (m) return `${m[1]} ${m[2].trim()}`
  // Alternative : chercher "CP mot" n'importe où.
  const alt = q.match(/(\d{5})\s+([A-Za-zÀ-ÿ'\- ]+)/)
  return alt ? `${alt[1]} ${alt[2].trim()}` : ''
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
  if (!q) return null
  const full = await tryQuery(q)
  if (full) return full
  const noNum = stripHouseNumber(q)
  if (noNum && noNum !== q) {
    const r = await tryQuery(noNum)
    if (r) return r
  }
  const cp = postcodeCity(q)
  if (cp) {
    const r = await tryQuery(cp)
    if (r) return r
  }
  return null
}
