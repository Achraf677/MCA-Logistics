// Planification des tournées express du bureau (remplace Vroom / ORS /optimization, fermé début
// 11/2026) — PUR, testé (planifExpress.test.ts).
//
// Entrée : le problème construit par `vroom.ts#construireProbleme` (jobs, shipments, vehicles :
// même format, mêmes règles : 5 min d'arrêt, créneaux = fenêtres dures avec attente, urgent =
// priorité, retrait → livraison dans le même véhicule, départ à l'heure choisie) + les matrices
// de route (ORS matrix). Sortie : même forme qu'une réponse Vroom (`routes`, `unassigned`), donc
// `lireRoute` / `coursesNonPlacees` / `dureeRouteMin` ne changent pas.
//
// Méthode : insertion la moins chère (urgentes d'abord, puis créneau le plus tôt) puis recherche
// locale (déplacer une course, y compris vers un autre véhicule) et reconstruction partielle
// (« ruine et recrée ») jusqu'à `budgetMs`. Déterministe (graine fixe).
//
// Capacité : `capacity[0]` = nombre MAXIMUM de courses par véhicule (équilibrage voulu par
// l'Edge : ceil(N / V)). Coût d'une route = mètres + 0,05 × (secondes de conduite + d'attente).
// Une course qu'aucun véhicule ne peut tenir (créneau impossible, journée dépassée, capacité)
// reste non placée.
import type { Matrices, Point } from './tourneeRoute.ts'

type Fenetre = Array<[number, number]> | undefined

interface Tache {
  /** Indice de nœud (0 = dépôt). */
  noeud: number
  id: number
  type: 'job' | 'pickup' | 'delivery'
  service: number
  debut: number
  fin: number
}

interface Unite {
  taches: Tache[] // [livraison] ou [retrait, livraison]
  priorite: number
}

interface VehiculeP {
  id: number
  debut: number
  fin: number
  cap: number
}

export interface ProblemeVroom {
  jobs: Array<Record<string, unknown>>
  shipments: Array<Record<string, unknown>>
  vehicles: Array<Record<string, unknown>>
}

export interface EtapeRoute { type: 'start' | 'job' | 'pickup' | 'delivery' | 'end'; id?: number; arrival: number }

export interface RoutePlanifiee {
  vehicle: number
  /** Mètres. */
  distance: number
  /** Secondes de conduite. */
  duration: number
  service: number
  waiting_time: number
  steps: EtapeRoute[]
}

export interface ResultatPlanification {
  routes: RoutePlanifiee[]
  unassigned: Array<{ id: number }>
}

const COUT_TEMPS = 0.05
const FIN_JOURNEE = 24 * 3600 - 1
const PRIO_URGENT_PENALITE = 1e9

function fen(tw: unknown): [number, number] {
  const f = tw as Fenetre
  return f && f.length ? [f[0][0], f[0][1]] : [0, FIN_JOURNEE]
}

function pointDe(loc: unknown): Point {
  const l = loc as [number, number]
  return { lng: l[0], lat: l[1] }
}

/** Points à passer dans la matrice : [dépôt, puis chaque arrêt dans l'ordre des unités]. */
export function pointsDuProbleme(pb: ProblemeVroom): { points: Point[]; unites: Unite[]; vehicules: VehiculeP[] } {
  const points: Point[] = []
  const unites: Unite[] = []
  const v0 = pb.vehicles[0]
  points.push(pointDe(v0?.start ?? [0, 0]))
  const ajouter = (o: Record<string, unknown>, type: Tache['type']): Tache => {
    points.push(pointDe(o.location))
    const [debut, fin] = fen(o.time_windows)
    return { noeud: points.length - 1, id: Number(o.id), type, service: Number(o.service ?? 0), debut, fin }
  }
  for (const j of pb.jobs) unites.push({ taches: [ajouter(j, 'job')], priorite: Number(j.priority ?? 0) })
  for (const s of pb.shipments) {
    const p = ajouter(s.pickup as Record<string, unknown>, 'pickup')
    const d = ajouter(s.delivery as Record<string, unknown>, 'delivery')
    unites.push({ taches: [p, d], priorite: Number(s.priority ?? 0) })
  }
  const vehicules = pb.vehicles.map(v => {
    const [debut, fin] = (v.time_window as [number, number] | undefined) ?? [0, FIN_JOURNEE]
    return { id: Number(v.id), debut, fin, cap: Number((v.capacity as number[] | undefined)?.[0] ?? 999) }
  })
  return { points, unites, vehicules }
}

interface Evaluation { ok: boolean; cout: number; dist: number; dur: number; serv: number; att: number; arrivees: number[] }
const KO: Evaluation = { ok: false, cout: Infinity, dist: 0, dur: 0, serv: 0, att: 0, arrivees: [] }

/** Simule une route (dépôt → tâches → dépôt) : faisabilité (fenêtres, fin de journée) et coût. */
function evaluer(seq: Tache[], v: VehiculeP, m: Matrices): Evaluation {
  let t = v.debut
  let prev = 0
  let dist = 0; let dur = 0; let serv = 0; let att = 0
  const arrivees: number[] = []
  for (const k of seq) {
    const d = m.durees[prev][k.noeud]
    dist += m.distances[prev][k.noeud]; dur += d
    t += d
    if (t > k.fin) return KO
    if (t < k.debut) { att += k.debut - t; t = k.debut }
    arrivees.push(t)
    t += k.service; serv += k.service
    prev = k.noeud
  }
  const retour = m.durees[prev][0]
  dist += m.distances[prev][0]; dur += retour
  t += retour
  if (t > v.fin) return KO
  return { ok: true, cout: dist + COUT_TEMPS * (dur + att), dist, dur, serv, att, arrivees }
}

interface Route { v: VehiculeP; unites: number[]; seq: Tache[]; ev: Evaluation }

function sequence(unites: number[], U: Unite[]): Tache[] {
  return unites.flatMap(u => U[u].taches)
}

/** Meilleure insertion de l'unité `u` dans la route `r` : positions (retrait puis livraison, dans cet ordre). */
function meilleureInsertion(u: number, r: Route, U: Unite[], m: Matrices): { seq: Tache[]; ev: Evaluation } | null {
  const t = U[u].taches
  let meilleur: { seq: Tache[]; ev: Evaluation } | null = null
  const base = r.seq
  const essayer = (seq: Tache[]) => {
    const ev = evaluer(seq, r.v, m)
    if (ev.ok && (!meilleur || ev.cout < meilleur.ev.cout)) meilleur = { seq, ev }
  }
  if (t.length === 1) {
    for (let i = 0; i <= base.length; i++) essayer([...base.slice(0, i), t[0], ...base.slice(i)])
  } else {
    for (let i = 0; i <= base.length; i++) {
      for (let j = i; j <= base.length; j++) {
        essayer([...base.slice(0, i), t[0], ...base.slice(i, j), t[1], ...base.slice(j)])
      }
    }
  }
  return meilleur
}

/** Générateur pseudo-aléatoire déterministe. */
function graine(s: number): () => number {
  let x = s >>> 0 || 1
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 }
}

const penalite = (u: Unite) => PRIO_URGENT_PENALITE * (1 + u.priorite / 10)

export function planifier(
  pb: ProblemeVroom, m: Matrices, opts: { budgetMs?: number; graine?: number } = {},
): ResultatPlanification {
  const { unites: U, vehicules } = pointsDuProbleme(pb)
  const budget = opts.budgetMs ?? 2500
  const rnd = graine(opts.graine ?? 20261020)
  const routes: Route[] = vehicules.map(v => ({ v, unites: [], seq: [], ev: { ok: true, cout: 0, dist: 0, dur: 0, serv: 0, att: 0, arrivees: [] } }))
  const nonPlacees = new Set<number>()

  /** Insère `u` au moins cher parmi tous les véhicules ; false si impossible. */
  const inserer = (u: number): boolean => {
    let best: { r: Route; seq: Tache[]; ev: Evaluation; delta: number } | null = null
    for (const r of routes) {
      if (r.unites.length >= r.v.cap) continue
      const ins = meilleureInsertion(u, r, U, m)
      if (!ins) continue
      const delta = ins.ev.cout - r.ev.cout
      if (!best || delta < best.delta) best = { r, ...ins, delta }
    }
    if (!best) return false
    // La position de l'unité dans la liste d'unités n'est pas utilisée pour l'ordre : seule `seq` compte.
    best.r.unites.push(u)
    best.r.seq = best.seq
    best.r.ev = best.ev
    return true
  }

  // 1. Construction : urgentes d'abord, puis créneau le plus tôt.
  const ordre = U.map((_, i) => i).sort((a, b) =>
    U[b].priorite - U[a].priorite
    || U[a].taches[U[a].taches.length - 1].fin - U[b].taches[U[b].taches.length - 1].fin
    || a - b)
  for (const u of ordre) if (!inserer(u)) nonPlacees.add(u)

  const coutTotal = () => routes.reduce((s, r) => s + r.ev.cout, 0)
    + [...nonPlacees].reduce((s, u) => s + penalite(U[u]), 0)

  /** Retire `u` de sa route et recalcule la séquence sans lui. */
  const retirer = (r: Route, u: number) => {
    r.unites = r.unites.filter(x => x !== u)
    const ids = new Set(U[u].taches.map(t => t.id))
    r.seq = r.seq.filter(t => !ids.has(t.id))
    r.ev = evaluer(r.seq, r.v, m)
  }

  const clone = (): Route[] => routes.map(r => ({ ...r, unites: [...r.unites], seq: [...r.seq] }))
  const restaurer = (copie: Route[], np: Set<number>) => {
    copie.forEach((c, i) => { routes[i].unites = c.unites; routes[i].seq = c.seq; routes[i].ev = c.ev })
    nonPlacees.clear(); np.forEach(x => nonPlacees.add(x))
  }

  const fin = Date.now() + budget
  /** 2. Recherche locale : chaque course est retirée puis replacée au mieux ; on garde si le total baisse. */
  const amelioration = (): boolean => {
    let mieux = false
    for (const r of routes.slice()) {
      for (const u of [...r.unites]) {
        if (Date.now() > fin) return mieux
        const avant = coutTotal()
        const copie = clone(); const np = new Set(nonPlacees)
        retirer(r, u)
        if (inserer(u) && coutTotal() < avant - 1e-6) mieux = true
        else restaurer(copie, np)
      }
    }
    return mieux
  }
  while (Date.now() < fin && amelioration()) { /* jusqu'à l'optimum local */ }

  // Courses non placées : nouvel essai (la recherche locale a pu libérer de la place).
  for (const u of [...nonPlacees].sort((a, b) => U[b].priorite - U[a].priorite)) if (inserer(u)) nonPlacees.delete(u)

  /** 3. Ruine et recrée : on retire quelques courses au hasard, on les replace au mieux. */
  let essais = 0
  while (Date.now() < fin && U.length > 2 && essais < 4000) {
    essais++
    const avant = coutTotal()
    const copie = clone(); const np = new Set(nonPlacees)
    const placees = routes.flatMap(r => r.unites.map(u => ({ r, u })))
    if (placees.length < 2) break
    const k = Math.max(2, Math.min(placees.length, Math.round(placees.length * (0.1 + 0.2 * rnd()))))
    const retires: number[] = []
    const prises = [...placees]
    for (let i = 0; i < k && prises.length; i++) {
      const [{ r, u }] = prises.splice(Math.floor(rnd() * prises.length), 1)
      retirer(r, u); retires.push(u)
    }
    retires.sort((a, b) => U[b].priorite - U[a].priorite || (rnd() < 0.5 ? -1 : 1))
    for (const u of retires) if (!inserer(u)) nonPlacees.add(u)
    for (const u of [...nonPlacees]) if (inserer(u)) nonPlacees.delete(u)
    if (coutTotal() < avant - 1e-6) { while (amelioration()) { /* recolle */ } } else restaurer(copie, np)
  }

  const out: RoutePlanifiee[] = []
  for (const r of routes) {
    if (r.seq.length === 0) continue
    const ev = evaluer(r.seq, r.v, m)
    const steps: EtapeRoute[] = [{ type: 'start', arrival: r.v.debut }]
    r.seq.forEach((t, i) => steps.push({ type: t.type, id: t.id, arrival: ev.arrivees[i] }))
    steps.push({ type: 'end', arrival: r.v.debut + ev.dur + ev.serv + ev.att })
    out.push({ vehicle: r.v.id, distance: ev.dist, duration: ev.dur, service: ev.serv, waiting_time: ev.att, steps })
  }
  const unassigned = [...nonPlacees].flatMap(u => U[u].taches.map(t => ({ id: t.id })))
  return { routes: out, unassigned }
}
