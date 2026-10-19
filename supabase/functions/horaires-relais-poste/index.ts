// Edge Function `horaires-relais-poste` — horaires du jour de points La Poste (bureaux, agences
// postales communales, relais poste commerçants), lus sur l'open data officiel de La Poste
// (calendrier d'ouverture, mis à jour chaque jour, sans clé).
//
// Entrée : { ids: string[] (identifiants de site, ex. "12532A"), date?: 'YYYY-MM-DD' (défaut : aujourd'hui à Paris) }
// Sortie : { ok, date, sites: { [id]: { plages: string[], ferme: boolean } } }   (site absent = horaires inconnus)
// Accès : session requise (verify_jwt) ; données publiques, aucune écriture.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { fetchJson } from '../_shared/http.ts'

const API = 'https://data.laposte.fr/data-fair/api/v1/datasets/laposte-ouvertur/lines'

interface Ligne {
  identifiant: string
  plage_horaire_1?: string | null
  plage_horaire_2?: string | null
  plage_horaire_3?: string | null
}

function jourParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()
  const auth = req.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ ok: false, error: 'Session requise.' }, 401)

  let body: { ids?: unknown; date?: unknown }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && /^[0-9A-Z]{5,8}$/.test(x)))] : []
  if (!ids.length || ids.length > 20) return jsonResponse({ ok: false, error: 'ids attendus (1 à 20).' }, 400)
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : jourParis()

  const qs = `date_calendrier:"${date}" AND (${ids.map(i => `identifiant:"${i}"`).join(' OR ')})`
  const url = `${API}?size=${ids.length * 2}&select=identifiant,plage_horaire_1,plage_horaire_2,plage_horaire_3&qs=${encodeURIComponent(qs)}`
  try {
    const r = await fetchJson<{ results?: Ligne[] }>(url, { timeoutMs: 15_000 })
    const sites: Record<string, { plages: string[]; ferme: boolean }> = {}
    for (const l of r?.results ?? []) {
      const brutes = [l.plage_horaire_1, l.plage_horaire_2, l.plage_horaire_3].filter((p): p is string => !!p)
      const plages = brutes.filter(p => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(p))
      sites[l.identifiant] = { plages, ferme: plages.length === 0 }
    }
    return jsonResponse({ ok: true, date, sites })
  } catch (e) {
    console.warn('horaires-relais-poste:', (e as Error)?.message)
    return jsonResponse({ ok: false, error: 'Horaires La Poste indisponibles.' }, 503)
  }
})
