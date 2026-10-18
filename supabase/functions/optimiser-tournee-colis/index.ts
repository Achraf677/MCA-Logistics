// Edge Function `optimiser-tournee-colis` — ordre de passage d'une tournée de colis sur les
// ROUTES (temps de conduite réels, sens uniques compris), heure de passage estimée par arrêt et
// tracé pour la carte. `rang` (ordre de la feuille) n'est jamais modifié : on écrit `ordre`,
// `eta_min` sur les arrêts, `trajet`, `ordre_mode = 'route'`, `ordre_calcule_le` sur la tournée.
//
// Entrée : { tournee_id, mode: 'tout' | 'restants', depart?: { lat, lng }, arrivee?: 'depart' | 'aucune' }
//   - 'tout' : tous les arrêts localisés ; 'restants' : seulement les arrêts pas encore traités
//     (les traités gardent leur place, devant) — typiquement « Recalculer depuis ma position ».
//   - départ : celui fourni (position du livreur) ; sinon celui déjà enregistré sur la tournée ;
//     sinon l'adresse du remettant lue sur la feuille (géocodée UNE fois puis gardée) ; sinon le
//     dépôt de la société (Paramètres). Arrivée par défaut : retour au départ.
// Sortie : { ok, approximatif, message?, km_total, duree_min, km_feuille, places, a_placer }
//
// Calcul : `_shared/tourneeRoute.ts` (pur, testé). Temps de conduite : matrice ORS
// `driving-car` en blocs ≤ 3 500 éléments ; tracé : itinéraires ORS en tronçons ≤ 50 points.
// ORS indisponible → ligne droite × 1,3 à 35 km/h, `approximatif = true`, jamais bloquant.
//
// Accès (verify_jwt = true) : la requête tourne avec la session de l'appelant, donc la RLS de
// `tournees_colis` décide (le salarié sur SA tournée non clôturée, le bureau avec
// `planning.tournees : update`). Aucune clé de service ici.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { fetchJson } from '../_shared/http.ts'
import { geocode } from '../_shared/geocode.ts'
import {
  ARRET_S, blocsMatrice, completerMatrices, decoderPolyligne, distanceParcours, encoderPolyligne,
  matricesVolOiseau, passages, regrouperNoeuds, resoudre, troncons, type Matrices, type Point,
} from '../_shared/tourneeRoute.ts'

const ORS = 'https://api.openrouteservice.org/v2'
const MESSAGE_APPROX = "Ordre approximatif : service d'itinéraire indisponible"
const PARALLELE_ECRITURES = 10

interface Arret {
  id: string; rang: number; numero: string | null; lat: number | null; lng: number | null
  statut: string | null; ordre: number | null
}

function pointValide(p: unknown): p is Point {
  const q = p as Point | null
  return !!q && Number.isFinite(q.lat) && Number.isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180
}

/** Matrice ORS complète n × n, assemblée bloc par bloc. Lève une erreur si un bloc échoue. */
async function matriceOrs(cle: string, pts: Point[]): Promise<{ m: Matrices; appels: number }> {
  const n = pts.length
  const durees: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null))
  const distances: (number | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null))
  const blocs = blocsMatrice(n)
  for (const b of blocs) {
    const src = pts.slice(b.sources[0], b.sources[1])
    const dst = pts.slice(b.destinations[0], b.destinations[1])
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
    })
    if (!r?.durations || !r?.distances) throw new Error('matrice ORS incomplète')
    for (let i = 0; i < src.length; i++) {
      for (let j = 0; j < dst.length; j++) {
        durees[b.sources[0] + i][b.destinations[0] + j] = r.durations[i]?.[j] ?? null
        distances[b.sources[0] + i][b.destinations[0] + j] = r.distances[i]?.[j] ?? null
      }
    }
  }
  return { m: completerMatrices({ durees, distances }, pts), appels: blocs.length }
}

/** Tracé routier du parcours (tronçons ≤ 50 points). null si ORS échoue : la carte relie les points. */
async function traceOrs(cle: string, pts: Point[]): Promise<{ polyline: string; appels: number } | null> {
  const parts = troncons(pts)
  const tout: Array<[number, number]> = []
  for (const [k, part] of parts.entries()) {
    const r = await fetchJson<{ routes?: Array<{ geometry?: string }> }>(`${ORS}/directions/driving-car`, {
      method: 'POST',
      headers: { Authorization: cle },
      body: { coordinates: part.map(p => [p.lng, p.lat]), instructions: false, radiuses: part.map(() => -1) },
      timeoutMs: 20_000,
    }).catch(() => null)
    const geo = r?.routes?.[0]?.geometry
    if (!geo) return null
    const seg = decoderPolyligne(geo)
    tout.push(...(k === 0 ? seg : seg.slice(1)))
  }
  return { polyline: encoderPolyligne(tout), appels: parts.length }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()
  const t0 = Date.now()

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const cleOrs = Deno.env.get('ORS_API_KEY') ?? ''
  if (!url || !anon) return jsonResponse({ ok: false, error: 'server misconfiguration' }, 500)
  const auth = req.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return jsonResponse({ ok: false, error: 'Session requise.' }, 401)

  let body: { tournee_id?: unknown; mode?: unknown; depart?: unknown; arrivee?: unknown }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }
  const tourneeId = typeof body.tournee_id === 'string' ? body.tournee_id : ''
  const mode = body.mode === 'restants' ? 'restants' : 'tout'
  if (!/^[0-9a-f-]{36}$/i.test(tourneeId)) return jsonResponse({ ok: false, error: 'tournee_id attendu.' }, 400)
  if (body.depart != null && !pointValide(body.depart)) return jsonResponse({ ok: false, error: 'Position de départ invalide.' }, 400)

  // Session de l'appelant : la RLS décide de ce qu'il voit et écrit.
  const db = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })

  const { data: t, error: eT } = await db.from('tournees_colis')
    .select('id, company_id, statut, entete, depart, arrivee').eq('id', tourneeId).maybeSingle()
  if (eT) return jsonResponse({ ok: false, error: eT.message }, 400)
  if (!t) return jsonResponse({ ok: false, error: 'Tournée introuvable.' }, 404)
  if (t.statut === 'cloturee') return jsonResponse({ ok: false, error: 'Tournée clôturée : rien à recalculer.' }, 409)

  const { data: lus, error: eA } = await db.from('tournees_colis_arrets')
    .select('id, rang, numero, lat, lng, statut, ordre').eq('tournee_id', tourneeId).order('rang')
  if (eA) return jsonResponse({ ok: false, error: eA.message }, 400)
  const arrets = (lus ?? []) as Arret[]

  // ── Départ / arrivée ──
  let depart: Point | null = null
  let departSource = 'position'
  let departStocke: (Point & { source: string }) | null = pointValide(t.depart) ? t.depart as Point & { source: string } : null
  if (pointValide(body.depart)) depart = { lat: body.depart.lat, lng: body.depart.lng }
  else if (departStocke) { depart = departStocke; departSource = departStocke.source ?? 'enregistre' }
  else {
    const adresse = typeof t.entete?.adresse_remettant === 'string' ? t.entete.adresse_remettant.trim() : ''
    const g = adresse ? await geocode(adresse).catch(() => null) : null
    if (g) { depart = g; departSource = 'remettant'; departStocke = { ...g, source: 'remettant' } }
    else {
      const { data: soc } = await db.from('companies').select('depot_lat, depot_lng').eq('id', t.company_id).maybeSingle()
      if (soc && Number.isFinite(soc.depot_lat) && Number.isFinite(soc.depot_lng)) {
        depart = { lat: soc.depot_lat, lng: soc.depot_lng }; departSource = 'depot'
        departStocke = { ...depart, source: 'depot' }
      }
    }
  }
  const arriveeMode = body.arrivee === 'aucune' || body.arrivee === 'depart'
    ? body.arrivee : (t.arrivee?.mode === 'aucune' ? 'aucune' : 'depart')

  // ── Nœuds à ordonner ──
  const traites = mode === 'restants' ? arrets.filter(a => a.statut != null) : []
  const aOrdonner = mode === 'restants' ? arrets.filter(a => a.statut == null) : arrets
  const noeuds = regrouperNoeuds(aOrdonner)
  const aPlacer = aOrdonner.filter(a => a.lat == null || a.lng == null).length
  if (!noeuds.length) {
    return jsonResponse({ ok: false, error: aPlacer ? 'Aucun arrêt localisé : place-les sur la carte d’abord.' : 'Plus rien à ordonner.' }, 422)
  }

  // Index 0 = départ (sans départ connu : on part du 1er arrêt de la feuille).
  const pts: Point[] = [depart ?? { lat: noeuds[0].lat, lng: noeuds[0].lng }, ...noeuds.map(n => ({ lat: n.lat, lng: n.lng }))]
  const idx = noeuds.map((_, i) => i + 1)
  const arrivee = arriveeMode === 'depart' ? 0 : null

  let m: Matrices
  let approximatif = false
  let appels = 0
  try {
    if (!cleOrs) throw new Error('ORS_API_KEY absente')
    const r = await matriceOrs(cleOrs, pts)
    m = r.m; appels += r.appels
  } catch (e) {
    console.warn('optimiser-tournee-colis: matrice ORS indisponible', (e as Error)?.message)
    m = matricesVolOiseau(pts); approximatif = true
  }

  const ordre = resoudre(m.durees, 0, idx, arrivee, { limiteMs: 1500 })
  const pass = passages(m, 0, ordre)
  const kmTotal = distanceParcours(m, 0, ordre, arrivee) / 1000
  const kmFeuille = distanceParcours(m, 0, idx, arrivee) / 1000
  const derniere = ordre[ordre.length - 1]
  const dureeS = pass[pass.length - 1].etaMin * 60 + ARRET_S + (arrivee != null ? m.durees[derniere][arrivee] : 0)

  // Tracé : départ → nœuds → (retour).
  const parcours = [pts[0], ...ordre.map(i => pts[i]), ...(arrivee != null ? [pts[0]] : [])]
  const trace = !approximatif && cleOrs ? await traceOrs(cleOrs, parcours) : null
  if (trace) appels += trace.appels
  const polyline = trace?.polyline ?? encoderPolyligne(parcours.map(p => [p.lat, p.lng]))

  const trajet = {
    // approximatif = ORDRE calculé sans les temps de route ; trace_droit = tracé en lignes droites.
    polyline, approximatif, trace_droit: !trace,
    km_total: Math.round(kmTotal * 10) / 10, km_feuille: Math.round(kmFeuille * 10) / 10,
    duree_min: Math.round(dureeS / 60), mode, depart: pts[0], depart_source: depart ? departSource : 'premier_arret',
    arrivee: arriveeMode, calcule_a: new Date().toISOString(),
    /** Ordre calculé (ids des arrêts) : « Revenir à l'ordre calculé » après un ordre manuel. */
    ordre_ids: [] as string[],
  }

  for (const p of pass) trajet.ordre_ids.push(...noeuds[p.noeud - 1].arrets)

  // ── Écritures : la tournée d'abord (si la RLS refuse, rien n'est touché) ──
  const { data: maj, error: eM } = await db.from('tournees_colis').update({
    trajet, ordre_mode: 'route', ordre_calcule_le: new Date().toISOString(),
    arrivee: { mode: arriveeMode },
    ...(departStocke && !pointValide(t.depart) ? { depart: departStocke } : {}),
  }).eq('id', tourneeId).select('id')
  if (eM) return jsonResponse({ ok: false, error: eM.message }, 400)
  if (!maj?.length) return jsonResponse({ ok: false, error: 'Tu ne peux pas modifier cette tournée.' }, 403)

  const ecritures: Array<{ id: string; ordre: number | null; eta_min: number | null }> = []
  // Traités (mode restants) : gardent leur ordre relatif, devant.
  const traitesTries = [...traites].sort((a, b) => (a.ordre ?? a.rang + 1e6) - (b.ordre ?? b.rang + 1e6) || a.rang - b.rang)
  traitesTries.forEach((a, i) => ecritures.push({ id: a.id, ordre: i + 1, eta_min: null }))
  let rangOrdre = traitesTries.length
  pass.forEach(p => {
    for (const id of noeuds[p.noeud - 1].arrets) ecritures.push({ id, ordre: ++rangOrdre, eta_min: p.etaMin })
  })
  for (const a of aOrdonner) if (a.lat == null || a.lng == null) ecritures.push({ id: a.id, ordre: null, eta_min: null })

  const echecs: string[] = []
  for (let i = 0; i < ecritures.length; i += PARALLELE_ECRITURES) {
    await Promise.all(ecritures.slice(i, i + PARALLELE_ECRITURES).map(async e => {
      const { error } = await db.from('tournees_colis_arrets').update({ ordre: e.ordre, eta_min: e.eta_min }).eq('id', e.id)
      if (error) echecs.push(error.message)
    }))
  }
  if (echecs.length) {
    console.error('optimiser-tournee-colis: écritures en échec', echecs.length, echecs[0])
    return jsonResponse({ ok: false, error: 'Ordre calculé mais pas enregistré en entier : relance le calcul.' }, 500)
  }

  console.log('optimiser-tournee-colis:', JSON.stringify({
    tournee: tourneeId, mode, noeuds: noeuds.length, arrets: aOrdonner.length, a_placer: aPlacer,
    appels_ors: appels, approximatif: trajet.approximatif, km: trajet.km_total, km_feuille: trajet.km_feuille,
    gain_km: Math.round((kmFeuille - kmTotal) * 10) / 10, duree_ms: Date.now() - t0, depart: trajet.depart_source,
  }))

  return jsonResponse({
    ok: true, approximatif: trajet.approximatif, message: trajet.approximatif ? MESSAGE_APPROX : undefined,
    km_total: trajet.km_total, duree_min: trajet.duree_min, km_feuille: trajet.km_feuille,
    places: ecritures.filter(e => e.ordre != null).length, a_placer: aPlacer,
  })
})
