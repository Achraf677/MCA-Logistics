// Edge Function `optimiser-tournee-colis` — ordre de passage d'une tournée de colis sur les
// ROUTES (temps de conduite réels, sens uniques compris), heure de passage estimée par arrêt et
// tracé pour la carte. `rang` (ordre de la feuille) n'est jamais modifié : on écrit `ordre`,
// `eta_min` sur les arrêts, `trajet`, `ordre_mode = 'route'`, `ordre_calcule_le` sur la tournée.
//
// Entrée : { tournee_id, mode: 'tout' | 'restants' | 'suivre', depart?: { lat, lng }, arrivee?: 'depart' | 'aucune' }
//   - 'tout' : tous les arrêts localisés ; 'restants' : seulement les arrêts pas encore traités
//     (les traités gardent leur place, devant) — typiquement « Recalculer depuis ma position ».
//   - 'suivre' : l'ordre ENREGISTRÉ (changé à la main : village déplacé, tournée inversée, glissé-déposé) n'est
//     pas recalculé ; on refait seulement kilomètres, durée, heures de passage et tracé le long de cet ordre
//     (tracé IGN, qui donne aussi distance et durée de chaque étape : ni ORS ni matrice). Départ : dernier arrêt traité, sinon le départ habituel.
//   - départ : celui fourni (position du livreur) ; sinon le départ des tournées de colis réglé
//     dans Paramètres (centre de tri) ; sinon l'adresse du remettant lue sur la feuille ; sinon
//     le dépôt de la société. Arrivée par défaut : retour au départ.
// Sortie : { ok, approximatif (toujours false), km_total, duree_min, km_feuille, places, a_placer }
//
// Calcul : `_shared/tourneeRoute.ts` (pur, testé). Temps de conduite : matrice ORS
// `driving-car` en blocs ≤ 3 500 éléments ; tracé : itinéraire IGN (Géoplateforme, sans clé)
// par tronçons de 17 points (ressource `_shared/ign.ts`). ORS indisponible / quota atteint → erreur claire, rien
// n'est modifié ; IGN indisponible → l'ordre est enregistré quand même, la carte n'a pas de ligne.
//
// Accès (verify_jwt = true) : la requête tourne avec la session de l'appelant, donc la RLS de
// `tournees_colis` décide (le salarié sur SA tournée non clôturée, le bureau avec
// `planning.tournees : update`). Aucune clé de service ici.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { ExternalApiError, fetchJson } from '../_shared/http.ts'
import { geocode } from '../_shared/geocode.ts'
import { IGN_ITINERAIRE, IGN_RESSOURCE } from '../_shared/ign.ts'
import {
  ARRET_S, IGN_MAX_POINTS, blocsMatrice, completerMatrices, decoderPolyligne, distanceParcours, encoderPolyligne,
  matriceCouts, noeudsDansOrdre, passages, passagesDepuisEtapes, penaliserChangementsVillage, penaliserOrdreZones, ordonnerZones, regrouperNoeuds, resoudre, troncons, type Matrices, type Point,
} from '../_shared/tourneeRoute.ts'

// Adresse officielle depuis le 28/04/2026 (l'ancienne api.openrouteservice.org n'a plus que 10 % du quota
// depuis le 27/08/2026 et ferme début 11/2026). Même clé.
const ORS = 'https://api.heigit.org/openrouteservice/v2'
const PARALLELE_ECRITURES = 10

interface Arret {
  id: string; rang: number; numero: string | null; lat: number | null; lng: number | null
  statut: string | null; ordre: number | null; commune: string | null; zone: string | null
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

const IGN = IGN_ITINERAIRE

interface Etape { distance: number; duration: number }

/** Un tronçon (≤ 17 points) par l'itinéraire IGN (BD TOPO, sans clé) : tracé + distance / durée de chaque étape. null si échec. */
async function tronconIgn(part: Point[]): Promise<{ pts: Array<[number, number]>; etapes: Etape[] } | null> {
  const p = (q: Point) => `${q.lng.toFixed(6)},${q.lat.toFixed(6)}`
  const params = new URLSearchParams({
    resource: IGN_RESSOURCE, profile: 'car', optimization: 'fastest', geometryFormat: 'polyline', getSteps: 'false',
    start: p(part[0]), end: p(part[part.length - 1]),
  })
  if (part.length > 2) params.set('intermediates', part.slice(1, -1).map(p).join('|'))
  try {
    const r = await fetchJson<{ geometry?: string; portions?: Array<{ distance?: number; duration?: number }> }>(`${IGN}?${params.toString()}`, { timeoutMs: 15_000 })
    if (!r?.geometry) return null
    const etapes = (r.portions ?? []).map(x => ({ distance: Number(x.distance ?? 0), duration: Number(x.duration ?? 0) }))
    return { pts: decoderPolyligne(r.geometry), etapes }
  } catch (e) {
    console.warn('optimiser-tournee-colis: tracé IGN', (e as Error)?.message, e instanceof ExternalApiError ? JSON.stringify(e.responseBody).slice(0, 300) : '')
    return null
  }
}

/**
 * Tracé routier du parcours, tronçon par tronçon (IGN), avec distance et durée de chaque étape
 * (une par point d'arrêt). null si un tronçon échoue : pas de ligne droite.
 */
async function tracer(pts: Point[]): Promise<{ polyline: string; appels: number; etapes: Etape[] } | null> {
  const parts = troncons(pts, IGN_MAX_POINTS)
  const tout: Array<[number, number]> = []
  const etapes: Etape[] = []
  for (const [k, part] of parts.entries()) {
    const seg = await tronconIgn(part)
    if (!seg) return null
    tout.push(...(k === 0 ? seg.pts : seg.pts.slice(1)))
    etapes.push(...seg.etapes)
  }
  return { polyline: encoderPolyligne(tout), appels: parts.length, etapes }
}

/** Réponse claire quand ORS refuse : quota du jour, accès, panne. Rien n'est modifié. */
function erreurRoutes(e: unknown): Response {
  const brut = e instanceof ExternalApiError ? JSON.stringify(e.responseBody ?? '') : ''
  const quota = e instanceof ExternalApiError && e.status === 403 && /quota/i.test(brut)
  const refuse = e instanceof ExternalApiError && e.status === 403 && !quota
  console.warn('optimiser-tournee-colis: ORS indisponible', (e as Error)?.message, brut.slice(0, 200))
  return jsonResponse({
    ok: false,
    error: quota
      ? "Limite du jour du service de routes atteinte : réessaie demain. L'ordre actuel est conservé."
      : refuse ? `Accès refusé par le service de routes (clé ou droits) : ${brut.slice(0, 120)}. L'ordre actuel est conservé.`
      : "Service de routes indisponible : réessaie dans un moment. L'ordre actuel est conservé.",
  }, 503)
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
  const mode = body.mode === 'restants' ? 'restants' : body.mode === 'suivre' ? 'suivre' : 'tout'
  if (!/^[0-9a-f-]{36}$/i.test(tourneeId)) return jsonResponse({ ok: false, error: 'tournee_id attendu.' }, 400)
  if (body.depart != null && !pointValide(body.depart)) return jsonResponse({ ok: false, error: 'Position de départ invalide.' }, 400)

  // Session de l'appelant : la RLS décide de ce qu'il voit et écrit.
  const db = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })

  const { data: t, error: eT } = await db.from('tournees_colis')
    .select('id, company_id, statut, entete, depart, arrivee, trajet').eq('id', tourneeId).maybeSingle()
  if (eT) return jsonResponse({ ok: false, error: eT.message }, 400)
  if (!t) return jsonResponse({ ok: false, error: 'Tournée introuvable.' }, 404)
  if (t.statut === 'cloturee') return jsonResponse({ ok: false, error: 'Tournée clôturée : rien à recalculer.' }, 409)

  const { data: lus, error: eA } = await db.from('tournees_colis_arrets')
    .select('id, rang, numero, lat, lng, statut, ordre, commune, zone').eq('tournee_id', tourneeId).order('rang')
  if (eA) return jsonResponse({ ok: false, error: eA.message }, 400)
  const arrets = (lus ?? []) as Arret[]

  // ── Départ / arrivée ──
  // Ordre : position fournie (recalcul en route) > départ des tournées de colis réglé dans
  // Paramètres (centre de tri) > adresse du remettant lue sur la feuille > dépôt de la société.
  // Recalculé à chaque fois (un réglage changé s'applique tout de suite) ; noté sur la tournée.
  let depart: Point | null = null
  let departSource = 'position'
  const dernierTraite = mode === 'suivre'
    ? [...arrets].filter(a => a.statut != null && a.lat != null && a.lng != null)
        .sort((a, b) => (b.ordre ?? -1) - (a.ordre ?? -1))[0]
    : undefined
  if (pointValide(body.depart)) depart = { lat: body.depart.lat, lng: body.depart.lng }
  else if (dernierTraite) { depart = { lat: dernierTraite.lat!, lng: dernierTraite.lng! }; departSource = 'position' }
  else {
    const { data: soc } = await db.from('companies')
      .select('depot_lat, depot_lng, depart_colis_lat, depart_colis_lng').eq('id', t.company_id).maybeSingle()
    const adresse = typeof t.entete?.adresse_remettant === 'string' ? t.entete.adresse_remettant.trim() : ''
    if (soc && Number.isFinite(soc.depart_colis_lat) && Number.isFinite(soc.depart_colis_lng)) {
      depart = { lat: soc.depart_colis_lat, lng: soc.depart_colis_lng }; departSource = 'reglage'
    } else {
      const g = adresse ? await geocode(adresse).catch(() => null) : null
      if (g) { depart = g; departSource = 'remettant' }
      else if (soc && Number.isFinite(soc.depot_lat) && Number.isFinite(soc.depot_lng)) {
        depart = { lat: soc.depot_lat, lng: soc.depot_lng }; departSource = 'depot'
      }
    }
  }
  const arriveeMode = body.arrivee === 'aucune' || body.arrivee === 'depart'
    ? body.arrivee : (t.arrivee?.mode === 'aucune' ? 'aucune' : 'depart')

  // ── Nœuds à ordonner ──
  const traites = mode !== 'tout' ? arrets.filter(a => a.statut != null) : []
  const aOrdonner = mode !== 'tout' ? arrets.filter(a => a.statut == null) : arrets
  // Brumath : chaque zone de la feuille compte comme un village (un seul bloc par zone).
  const noeuds = regrouperNoeuds(aOrdonner.map(a => (a.commune && a.zone ? { ...a, commune: `${a.commune} ${a.zone}` } : a)))
  const aPlacer = aOrdonner.filter(a => a.lat == null || a.lng == null).length
  if (!noeuds.length) {
    return jsonResponse({ ok: false, error: aPlacer ? 'Aucun arrêt localisé : place-les sur la carte d’abord.' : 'Plus rien à ordonner.' }, 422)
  }

  // Index 0 = départ (sans départ connu : on part du 1er arrêt de la feuille).
  const pts: Point[] = [depart ?? { lat: noeuds[0].lat, lng: noeuds[0].lng }, ...noeuds.map(n => ({ lat: n.lat, lng: n.lng }))]
  const idx = noeuds.map((_, i) => i + 1)
  const arrivee = arriveeMode === 'depart' ? 0 : null

  if (mode === 'suivre') {
    const suite = noeudsDansOrdre(noeuds, new Map(aOrdonner.map(a => [a.id, a.ordre])))
    const parcoursS = [pts[0], ...suite.map(n => ({ lat: n.lat, lng: n.lng })), ...(arrivee != null ? [pts[0]] : [])]
    // Tracé IGN le long de l'ordre enregistré : il donne aussi distance et durée de chaque étape (sans ORS).
    const traceS = await tracer(parcoursS)
    if (!traceS || traceS.etapes.length !== parcoursS.length - 1) {
      return jsonResponse({ ok: false, error: "Tracé indisponible (service de l'IGN) : réessaie dans un moment. L'ordre actuel est conservé." }, 503)
    }
    const etapes = traceS.etapes
    const aller = etapes.slice(0, suite.length)
    const passS = passagesDepuisEtapes(aller)
    const retour = arrivee != null ? etapes[suite.length] : null
    const kmS = etapes.reduce((s, x) => s + x.distance, 0) / 1000
    const dureeSuivre = passS[passS.length - 1].etaMin * 60 + ARRET_S + (retour?.duration ?? 0)
    const avant = (t.trajet ?? {}) as Record<string, unknown>
    const trajetS = {
      ...avant,
      polyline: traceS.polyline, approximatif: false, trace_droit: false,
      km_total: Math.round(kmS * 10) / 10, km_feuille: (avant.km_feuille as number | undefined) ?? Math.round(kmS * 10) / 10,
      duree_min: Math.round(dureeSuivre / 60), mode: traites.length ? 'restants' : 'tout', depart: pts[0],
      depart_source: depart ? departSource : 'premier_arret', arrivee: arriveeMode, calcule_a: new Date().toISOString(),
      ordre_ids: Array.isArray(avant.ordre_ids) ? avant.ordre_ids : [],
    }
    const { data: majS, error: eMS } = await db.from('tournees_colis').update({ trajet: trajetS }).eq('id', tourneeId).select('id')
    if (eMS) return jsonResponse({ ok: false, error: eMS.message }, 400)
    if (!majS?.length) return jsonResponse({ ok: false, error: 'Tu ne peux pas modifier cette tournée.' }, 403)
    const etas = passS.flatMap(p => suite[p.noeud - 1].arrets.map(id => ({ id, eta: p.etaMin })))
    const echecsS: string[] = []
    for (let i = 0; i < etas.length; i += PARALLELE_ECRITURES) {
      await Promise.all(etas.slice(i, i + PARALLELE_ECRITURES).map(async e => {
        const { error } = await db.from('tournees_colis_arrets').update({ eta_min: e.eta }).eq('id', e.id)
        if (error) echecsS.push(error.message)
      }))
    }
    if (echecsS.length) return jsonResponse({ ok: false, error: 'Trajet calculé mais pas enregistré en entier : relance.' }, 500)
    return jsonResponse({
      ok: true, approximatif: false, km_total: trajetS.km_total, duree_min: trajetS.duree_min,
      km_feuille: trajetS.km_feuille, places: etas.length, a_placer: aPlacer,
    })
  }

  // Pas de calcul « à vol d'oiseau » : si ORS refuse (quota du jour, panne), on le dit et on
  // ne touche à rien (l'ordre déjà enregistré reste celui d'avant).
  let m: Matrices
  let appels = 0
  try {
    if (!cleOrs) throw new Error('ORS_API_KEY absente')
    const r = await matriceOrs(cleOrs, pts)
    m = r.m; appels += r.appels
  } catch (e) {
    return erreurRoutes(e)
  }

  // ~0,8 s de calcul au plus (les fonctions Supabase coupent vers 2 s de calcul).
  // On optimise la DISTANCE par la route (le plus court), village par village (chaque village
  // en un seul bloc : décision du 19/10/2026), pas le temps ni le vol d'oiseau.
  const cles = [null, ...noeuds.map(n => n.commune)]
  // Zones de Brumath : 1 → 7 imposé PENDANT la recherche (`penaliserOrdreZones`), pour que chaque zone ait ses meilleurs points
  // d'entrée / sortie ; `ordonnerZones` ne fait plus que garantir l'ordre (sans effet si déjà rangé).
  const couts = penaliserOrdreZones(penaliserChangementsVillage(matriceCouts(m), cles), cles)
  const ordre = ordonnerZones(resoudre(couts, 0, idx, arrivee, { limiteMs: 800 }), cles)
  const pass = passages(m, 0, ordre)
  const kmTotal = distanceParcours(m, 0, ordre, arrivee) / 1000
  const kmFeuille = distanceParcours(m, 0, idx, arrivee) / 1000
  const derniere = ordre[ordre.length - 1]
  const dureeS = pass[pass.length - 1].etaMin * 60 + ARRET_S + (arrivee != null ? m.durees[derniere][arrivee] : 0)

  // Tracé : départ → nœuds → (retour).
  const parcours = [pts[0], ...ordre.map(i => pts[i]), ...(arrivee != null ? [pts[0]] : [])]
  // L'ordre vient de la matrice ORS (vraies routes) : il est enregistré même si le tracé IGN échoue (carte sans ligne).
  // Avant le 28/10/2026 un tracé en échec bloquait tout : la tournée restait dans l'ordre de la feuille.
  const trace = await tracer(parcours)
  if (trace) appels += trace.appels
  const polyline = trace?.polyline ?? ''

  const trajet = {
    // approximatif / trace_droit : toujours faux (plus de secours), gardés pour l'écran.
    polyline, approximatif: false, trace_droit: false,
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
    ...(depart && departSource !== 'position' ? { depart: { ...depart, source: departSource } } : {}),
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
    appels_externes: appels, km: trajet.km_total, km_feuille: trajet.km_feuille,
    gain_km: Math.round((kmFeuille - kmTotal) * 10) / 10, duree_ms: Date.now() - t0, depart: trajet.depart_source,
  }))

  return jsonResponse({
    ok: true, approximatif: false,
    km_total: trajet.km_total, duree_min: trajet.duree_min, km_feuille: trajet.km_feuille,
    places: ecritures.filter(e => e.ordre != null).length, a_placer: aPlacer,
    ...(trace ? {} : { message: `Itinéraire calculé : ${trajet.km_total} km. Tracé de la carte indisponible (IGN) pour l'instant.` }),
  })
})
