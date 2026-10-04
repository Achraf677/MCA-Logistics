// Problème d'optimisation de tournées (OpenRouteService / Vroom) — PUR, testé
// (vroom.test.ts). Utilisé par l'Edge `optimize-tours` (lots T3 / T4, revue 04a).
//
// Règles :
// - temps en SECONDES DEPUIS MINUIT (heure locale du jour de la tournée) : le
//   véhicule part du dépôt à `departSec`, les arrivées rendues par Vroom sont
//   donc directement des heures de la journée ;
// - temps d'arrêt : 5 min par livraison et par retrait (décision du 04/10/2026) ;
// - créneaux de la fiche course → fenêtres horaires (`time_windows`) ;
// - urgent → priorité maximale (servi d'abord si tout ne rentre pas) ;
// - retrait à faire ET adresse de retrait localisée → paire retrait → livraison
//   (`shipments`) : Vroom charge avant de livrer, dans le même véhicule ;
//   sinon un simple arrêt de livraison (`jobs`), comme avant.
// - une même séquence numérote retraits et livraisons (`pickup_order`,
//   `stop_order`), comme dans Mes courses (shared/lib/arretsJour.ts).

export const TEMPS_ARRET_SEC = 300
export const FIN_JOURNEE_SEC = 24 * 3600 - 1
export const DEPART_DEFAUT = '08:00'
const PRIORITE_URGENT = 100

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

/** « HH:MM[:SS] » → secondes depuis minuit ; null si mal formé. */
export function heureEnSecondes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = HHMM.exec(v.trim())
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)
}

/** Secondes depuis minuit → « HH:MM:SS » (plafonné à 23:59:59). */
export function secondesEnHeure(s: number): string {
  const t = Math.max(0, Math.min(FIN_JOURNEE_SEC, Math.round(s)))
  const hh = Math.floor(t / 3600)
  const mm = Math.floor((t % 3600) / 60)
  const ss = t % 60
  return [hh, mm, ss].map(n => String(n).padStart(2, '0')).join(':')
}

/**
 * Créneau saisi → fenêtre Vroom. Début seul = « pas avant », fin seule = « au
 * plus tard ». Créneau incohérent (fin avant début) : ignoré plutôt que de
 * rendre la course impossible à placer.
 */
export function fenetre(debut: unknown, fin: unknown): Array<[number, number]> | undefined {
  const a = heureEnSecondes(debut)
  const b = heureEnSecondes(fin)
  if (a == null && b == null) return undefined
  const de = a ?? 0
  const jusqua = b ?? FIN_JOURNEE_SEC
  if (jusqua < de) return undefined
  return [[de, jusqua]]
}

export interface CourseAOptimiser {
  id: string
  delivery_lat: number
  delivery_lng: number
  /** Coordonnées du retrait, seulement si le retrait est à faire ET localisé. */
  retrait: { lat: number; lng: number } | null
  urgent?: boolean | null
  creneau_retrait_debut?: string | null
  creneau_retrait_fin?: string | null
  creneau_livraison_debut?: string | null
  creneau_livraison_fin?: string | null
}

export interface VehiculeAOptimiser { ref: number }

type Ref = { courseId: string; type: 'livraison' | 'retrait' }

export interface Probleme {
  jobs: Array<Record<string, unknown>>
  shipments: Array<Record<string, unknown>>
  vehicles: Array<Record<string, unknown>>
  /** Id d'étape Vroom → course et type d'arrêt. */
  refs: Map<number, Ref>
}

export function construireProbleme(
  courses: CourseAOptimiser[],
  vehicules: VehiculeAOptimiser[],
  p: { depot: { lat: number; lng: number }; departSec: number; capacite: number },
): Probleme {
  const refs = new Map<number, Ref>()
  const jobs: Array<Record<string, unknown>> = []
  const shipments: Array<Record<string, unknown>> = []
  let id = 0
  for (const c of courses) {
    const priorite = c.urgent ? { priority: PRIORITE_URGENT } : {}
    const twLiv = fenetre(c.creneau_livraison_debut, c.creneau_livraison_fin)
    const livraison = {
      location: [c.delivery_lng, c.delivery_lat],
      service: TEMPS_ARRET_SEC,
      ...(twLiv ? { time_windows: twLiv } : {}),
    }
    if (c.retrait) {
      const idR = ++id
      const idL = ++id
      refs.set(idR, { courseId: c.id, type: 'retrait' })
      refs.set(idL, { courseId: c.id, type: 'livraison' })
      const twRet = fenetre(c.creneau_retrait_debut, c.creneau_retrait_fin)
      shipments.push({
        amount: [1],
        ...priorite,
        pickup: {
          id: idR,
          location: [c.retrait.lng, c.retrait.lat],
          service: TEMPS_ARRET_SEC,
          ...(twRet ? { time_windows: twRet } : {}),
        },
        delivery: { id: idL, ...livraison },
      })
    } else {
      const idL = ++id
      refs.set(idL, { courseId: c.id, type: 'livraison' })
      jobs.push({ id: idL, ...livraison, amount: [1], ...priorite })
    }
  }
  const depot = [p.depot.lng, p.depot.lat]
  const vehicles = vehicules.map(v => ({
    id: v.ref,
    profile: 'driving-car',
    start: depot,
    end: depot,
    capacity: [Math.max(1, p.capacite)],
    time_window: [p.departSec, FIN_JOURNEE_SEC],
  }))
  return { jobs, shipments, vehicles, refs }
}

export interface PositionCourse {
  courseId: string
  stop_order: number | null
  pickup_order: number | null
  /** Heure d'arrivée prévue à la LIVRAISON (HH:MM:SS). */
  arrival_time: string | null
}

type Etape = { type?: string; id?: number; arrival?: number }

/**
 * Lit une route Vroom : une seule séquence numérote retraits et livraisons.
 * Une course sans retrait reçoit `pickup_order = stop_order` (un retrait
 * éventuel, coché plus tard, se placera juste avant sa livraison).
 */
export function lireRoute(steps: Etape[], refs: Map<number, Ref>): PositionCourse[] {
  const par = new Map<string, PositionCourse>()
  let n = 0
  for (const s of steps) {
    if (s.type !== 'job' && s.type !== 'pickup' && s.type !== 'delivery') continue
    if (s.id == null) continue
    const ref = refs.get(s.id)
    if (!ref) continue
    n += 1
    const ligne = par.get(ref.courseId)
      ?? { courseId: ref.courseId, stop_order: null, pickup_order: null, arrival_time: null }
    if (ref.type === 'retrait') ligne.pickup_order = n
    else {
      ligne.stop_order = n
      ligne.arrival_time = typeof s.arrival === 'number' ? secondesEnHeure(s.arrival) : null
    }
    par.set(ref.courseId, ligne)
  }
  return [...par.values()].map(l => ({ ...l, pickup_order: l.pickup_order ?? l.stop_order }))
}

/** Courses non placées (une paire non placée compte une fois). */
export function coursesNonPlacees(unassigned: Array<{ id?: number }>, refs: Map<number, Ref>): string[] {
  const ids = new Set<string>()
  for (const u of unassigned) {
    const r = u.id != null ? refs.get(u.id) : undefined
    if (r) ids.add(r.courseId)
  }
  return [...ids]
}

/** Durée réelle d'une route en minutes : conduite + arrêts + attente. */
export function dureeRouteMin(r: { duration?: number; service?: number; waiting_time?: number }): number {
  return Math.round(((r.duration ?? 0) + (r.service ?? 0) + (r.waiting_time ?? 0)) / 60)
}
