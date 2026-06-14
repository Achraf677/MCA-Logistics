import { jsonResponse, optionsResponse } from '../_shared/cors.ts'

const GEO_API = 'https://api-adresse.data.gouv.fr/search'
const IGN_API = 'https://data.geopf.fr/navigation/itineraire'

async function geocode(adresse: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(`${GEO_API}/?q=${encodeURIComponent(adresse)}&limit=1`)
    if (!res.ok) return null
    const json = await res.json()
    const coords = json?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    return [coords[0] as number, coords[1] as number]  // [lon, lat]
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  let body: { depart?: string; arrivee?: string }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'Corps JSON invalide' }, 400) }

  const depart  = (body?.depart  ?? '').trim()
  const arrivee = (body?.arrivee ?? '').trim()

  if (!depart || !arrivee) {
    return jsonResponse({ ok: false, error: 'depart et arrivee sont requis' }, 400)
  }

  const [dCoords, aCoords] = await Promise.all([geocode(depart), geocode(arrivee)])

  if (!dCoords) return jsonResponse({ ok: false, error: `Adresse introuvable : "${depart}"` })
  if (!aCoords) return jsonResponse({ ok: false, error: `Adresse introuvable : "${arrivee}"` })

  const [dLon, dLat] = dCoords
  const [aLon, aLat] = aCoords

  let ignRes: Response
  try {
    ignRes = await fetch(
      `${IGN_API}?resource=bdtopo-osrm&start=${dLon},${dLat}&end=${aLon},${aLat}&profile=car&geometryFormat=geojson`
    )
  } catch (e) {
    return jsonResponse({ ok: false, error: `API IGN indisponible : ${(e as Error).message}` })
  }

  if (!ignRes.ok) {
    const text = await ignRes.text().catch(() => '')
    return jsonResponse({ ok: false, error: `IGN ${ignRes.status}: ${text.slice(0, 200)}` })
  }

  const ign = await ignRes.json()

  const distance_km = Math.round((ign.distance as number) / 100) / 10
  const duree_min   = Math.round((ign.duration as number) / 60)

  return jsonResponse({
    ok: true,
    data: {
      distance_km,
      duree_min,
      peage_estime_eur: 0,
      geometry:       ign.geometry,
      depart_label:   depart,
      arrivee_label:  arrivee,
      depart_coords:  [dLat, dLon],    // [lat, lon] pour Leaflet
      arrivee_coords: [aLat, aLon],
    },
  })
})
