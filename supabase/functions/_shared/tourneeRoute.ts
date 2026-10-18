// Ordre de passage d'une tournée de colis sur les ROUTES — PUR, testé (tourneeRoute.test.ts).
// Aucun appel réseau ici : l'Edge `optimiser-tournee-colis` fournit la matrice de temps
// (ORS) ou, à défaut, une matrice « vol d'oiseau × 1,3 » ; ce module décide de l'ordre.
//
// 1. Les arrêts au même point (lat / lng arrondies à 5 décimales, ~1 m) forment UN nœud :
//    on ne s'arrête qu'une fois devant un immeuble ou un relais.
// 2. Solveur : plus proche voisin depuis le départ, puis améliorations locales jusqu'à
//    stabilité (2-opt et déplacement de segments de 1 à 3 nœuds, « Or-opt »). Matrice
//    asymétrique gérée (sens uniques) : chaque gain est calculé avec les vrais sens.
//    Déterministe : même entrée = même ordre (parcours dans un ordre fixe, premier gain pris).
// 3. Découpage des appels ORS : blocs de matrice ≤ 3 500 éléments, itinéraires ≤ 50 points.

export interface ArretAPlacer {
  id: string
  lat: number | null
  lng: number | null
  numero: string | null
  rang: number
}

export interface Noeud {
  cle: string
  lat: number
  lng: number
  /** Ids des arrêts du nœud, dans l'ordre de passage (numéros croissants, pairs puis impairs). */
  arrets: string[]
  /** Plus petit rang de la feuille (sert à l'ordre de référence « feuille »). */
  rang: number
}

export interface Point {
  lat: number
  lng: number
}

/** Limites ORS (openrouteservice.org/restrictions, relevées le 18/10/2026). */
export const MATRICE_MAX_ELEMENTS = 3500
export const ITINERAIRE_MAX_POINTS = 50
/** Repli sans ORS : la route fait en moyenne 1,3 fois la ligne droite. */
export const FACTEUR_ROUTE = 1.3
/** Vitesse moyenne de repli en tournée de distribution (villages, bourgs). */
export const VITESSE_REPLI_KMH = 35
/** Temps passé à un arrêt (descendre, remettre, remonter), en secondes — à ajuster. */
export const ARRET_S = 120

// ── 1. Nœuds ────────────────────────────────────────────────────────────────

function numeroTri(n: string | null): { pair: number; valeur: number } {
  const m = (n ?? '').match(/\d+/)
  if (!m) return { pair: 2, valeur: Number.MAX_SAFE_INTEGER }
  const v = Number(m[0])
  return { pair: v % 2 === 0 ? 0 : 1, valeur: v }
}

/** Arrêts localisés → nœuds (même point = un arrêt du camion). Sans coordonnées : ignorés. */
export function regrouperNoeuds(arrets: ArretAPlacer[]): Noeud[] {
  const par = new Map<string, { lat: number; lng: number; arrets: ArretAPlacer[] }>()
  for (const a of arrets) {
    if (a.lat == null || a.lng == null || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue
    const cle = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}`
    const n = par.get(cle) ?? { lat: a.lat, lng: a.lng, arrets: [] }
    n.arrets.push(a)
    par.set(cle, n)
  }
  return [...par.entries()]
    .map(([cle, n]) => {
      const tries = [...n.arrets].sort((x, y) => {
        const a = numeroTri(x.numero); const b = numeroTri(y.numero)
        return a.pair - b.pair || a.valeur - b.valeur || x.rang - y.rang
      })
      return { cle, lat: n.lat, lng: n.lng, arrets: tries.map(a => a.id), rang: Math.min(...n.arrets.map(a => a.rang)) }
    })
    .sort((a, b) => a.rang - b.rang || (a.cle < b.cle ? -1 : 1))
}

// ── 2. Découpage des appels ORS ─────────────────────────────────────────────

export interface BlocMatrice {
  /** Indices [début, fin[ des origines et des destinations dans la liste complète des points. */
  sources: [number, number]
  destinations: [number, number]
}

/** Blocs carrés de côté ⌊√max⌋ (59 pour 3 500) couvrant la matrice n × n. */
export function blocsMatrice(n: number, maxElements = MATRICE_MAX_ELEMENTS): BlocMatrice[] {
  if (n <= 0) return []
  const cote = Math.max(1, Math.floor(Math.sqrt(maxElements)))
  const blocs: BlocMatrice[] = []
  for (let i = 0; i < n; i += cote) {
    for (let j = 0; j < n; j += cote) {
      blocs.push({ sources: [i, Math.min(n, i + cote)], destinations: [j, Math.min(n, j + cote)] })
    }
  }
  return blocs
}

/** Itinéraire en tronçons de ≤ max points ; chaque tronçon repart du dernier point du précédent. */
export function troncons<T>(points: T[], max = ITINERAIRE_MAX_POINTS): T[][] {
  if (points.length < 2) return []
  const pas = Math.max(1, max - 1)
  const out: T[][] = []
  for (let i = 0; i < points.length - 1; i += pas) out.push(points.slice(i, Math.min(points.length, i + pas + 1)))
  return out
}

// ── Repli : vol d'oiseau ────────────────────────────────────────────────────

/** Distance à vol d'oiseau (haversine), en mètres. */
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface Matrices {
  /** Secondes de conduite, [origine][destination]. */
  durees: number[][]
  /** Mètres, [origine][destination]. */
  distances: number[][]
}

/** Matrices de repli : ligne droite × 1,3, à 35 km/h. */
export function matricesVolOiseau(points: Point[]): Matrices {
  const distances = points.map(a => points.map(b => distanceM(a, b) * FACTEUR_ROUTE))
  const durees = distances.map(l => l.map(d => d / (VITESSE_REPLI_KMH / 3.6)))
  return { durees, distances }
}

/** Trous d'une matrice ORS (point injoignable = null) bouchés par le repli vol d'oiseau. */
export function completerMatrices(m: { durees: (number | null)[][]; distances: (number | null)[][] }, points: Point[]): Matrices {
  const repli = matricesVolOiseau(points)
  return {
    durees: m.durees.map((l, i) => l.map((v, j) => (v == null || !Number.isFinite(v) ? repli.durees[i][j] : v))),
    distances: m.distances.map((l, i) => l.map((v, j) => (v == null || !Number.isFinite(v) ? repli.distances[i][j] : v))),
  }
}

// ── 3. Solveur ──────────────────────────────────────────────────────────────

/** Coût d'un parcours : départ → nœuds → arrivée (arrivée null = parcours ouvert). */
export function coutParcours(c: number[][], depart: number, ordre: number[], arrivee: number | null): number {
  let total = 0
  let prec = depart
  for (const n of ordre) { total += c[prec][n]; prec = n }
  if (arrivee != null) total += c[prec][arrivee]
  return total
}

function plusProcheVoisin(c: number[][], depart: number, noeuds: number[]): number[] {
  const restants = new Set(noeuds)
  const ordre: number[] = []
  let courant = depart
  while (restants.size) {
    let meilleur = -1; let cout = Infinity
    for (const n of noeuds) {
      if (!restants.has(n)) continue
      if (c[courant][n] < cout) { cout = c[courant][n]; meilleur = n }
    }
    ordre.push(meilleur); restants.delete(meilleur); courant = meilleur
  }
  return ordre
}

const EPS = 1e-9

/** 2-opt asymétrique : inverse un segment si le parcours réel (sens compris) raccourcit. */
function passe2Opt(c: number[][], depart: number, ordre: number[], arrivee: number | null): boolean {
  const n = ordre.length
  const prec = (i: number) => (i === 0 ? depart : ordre[i - 1])
  for (let i = 0; i < n - 1; i++) {
    let aller = 0; let retour = 0
    for (let k = i + 1; k < n; k++) {
      aller += c[ordre[k - 1]][ordre[k]]
      retour += c[ordre[k]][ordre[k - 1]]
      const p = prec(i)
      const suiv = k + 1 < n ? ordre[k + 1] : arrivee
      const avant = c[p][ordre[i]] + aller + (suiv == null ? 0 : c[ordre[k]][suiv])
      const apres = c[p][ordre[k]] + retour + (suiv == null ? 0 : c[ordre[i]][suiv])
      if (apres + EPS < avant) {
        const seg = ordre.slice(i, k + 1).reverse()
        ordre.splice(i, k - i + 1, ...seg)
        return true
      }
    }
  }
  return false
}

/** Or-opt : déplace un segment de 1 à 3 nœuds (même sens) à un meilleur endroit. */
function passeOrOpt(c: number[][], depart: number, ordre: number[], arrivee: number | null): boolean {
  const n = ordre.length
  const at = (i: number) => (i < 0 ? depart : i >= n ? arrivee : ordre[i])
  const arc = (a: number | null, b: number | null) => (a == null || b == null ? 0 : c[a][b])
  for (let len = 1; len <= 3; len++) {
    for (let i = 0; i + len <= n; i++) {
      const s0 = ordre[i]; const s1 = ordre[i + len - 1]
      const p = at(i - 1); const q = at(i + len)
      const retrait = arc(p, s0) + arc(s1, q) - arc(p, q)
      for (let j = -1; j < n; j++) {
        if (j >= i - 1 && j <= i + len - 1) continue
        const a = at(j); const b = at(j + 1)
        const ajout = arc(a, s0) + arc(s1, b) - arc(a, b)
        if (ajout + EPS < retrait) {
          const seg = ordre.splice(i, len)
          const pos = j < i ? j + 1 : j + 1 - len
          ordre.splice(pos, 0, ...seg)
          return true
        }
      }
    }
  }
  return false
}

/** Jusqu'à 10 nœuds : calcul exact (programmation dynamique, ~100 000 opérations). */
const EXACT_MAX = 10

function exact(c: number[][], depart: number, noeuds: number[], arrivee: number | null): number[] {
  const n = noeuds.length
  const plein = (1 << n) - 1
  // cout[masque][k] = meilleur coût départ → (nœuds du masque) finissant par k.
  const cout: number[][] = Array.from({ length: 1 << n }, () => new Array(n).fill(Infinity))
  const prec: number[][] = Array.from({ length: 1 << n }, () => new Array(n).fill(-1))
  for (let k = 0; k < n; k++) cout[1 << k][k] = c[depart][noeuds[k]]
  for (let m = 1; m <= plein; m++) {
    for (let k = 0; k < n; k++) {
      const v = cout[m][k]
      if (!(m & (1 << k)) || v === Infinity) continue
      for (let j = 0; j < n; j++) {
        if (m & (1 << j)) continue
        const m2 = m | (1 << j)
        const w = v + c[noeuds[k]][noeuds[j]]
        if (w + EPS < cout[m2][j]) { cout[m2][j] = w; prec[m2][j] = k }
      }
    }
  }
  let fin = 0; let best = Infinity
  for (let k = 0; k < n; k++) {
    const w = cout[plein][k] + (arrivee == null ? 0 : c[noeuds[k]][arrivee])
    if (w + EPS < best) { best = w; fin = k }
  }
  const ordre: number[] = []
  let m = plein; let k = fin
  while (k >= 0) { ordre.push(noeuds[k]); const p = prec[m][k]; m &= ~(1 << k); k = p }
  return ordre.reverse()
}

export interface OptionsSolveur {
  /** Garde-fou de temps (ms) ; l'ordre reste valide s'il est atteint. */
  limiteMs?: number
  /** Garde-fou de passes. */
  maxPasses?: number
}

/**
 * Ordre de passage des nœuds `noeuds` (indices dans la matrice), du `depart` à l'`arrivee`
 * (null = parcours ouvert). Renvoie les indices dans l'ordre.
 */
export function resoudre(c: number[][], depart: number, noeuds: number[], arrivee: number | null, opts: OptionsSolveur = {}): number[] {
  if (noeuds.length <= 1) return [...noeuds]
  if (noeuds.length <= EXACT_MAX) return exact(c, depart, noeuds, arrivee)
  const limite = Date.now() + (opts.limiteMs ?? 3000)
  const maxPasses = opts.maxPasses ?? 100_000
  const ordre = plusProcheVoisin(c, depart, noeuds)
  for (let passe = 0; passe < maxPasses && Date.now() < limite; passe++) {
    if (passe2Opt(c, depart, ordre, arrivee)) continue
    if (passeOrOpt(c, depart, ordre, arrivee)) continue
    break
  }
  return ordre
}

// ── Heures de passage ───────────────────────────────────────────────────────

export interface Passage {
  /** Index du nœud dans la matrice. */
  noeud: number
  /** Minutes depuis le départ jusqu'à l'arrivée à ce nœud (arrêts précédents compris). */
  etaMin: number
  /** Mètres depuis le départ jusqu'à ce nœud. */
  distanceM: number
}

/** Heure de passage cumulée de chaque nœud (conduite + temps d'arrêt aux nœuds précédents). */
export function passages(m: Matrices, depart: number, ordre: number[], arretS = ARRET_S): Passage[] {
  const out: Passage[] = []
  let t = 0; let d = 0; let prec = depart
  ordre.forEach((n, i) => {
    t += m.durees[prec][n] + (i > 0 ? arretS : 0)
    d += m.distances[prec][n]
    out.push({ noeud: n, etaMin: Math.round(t / 60), distanceM: Math.round(d) })
    prec = n
  })
  return out
}

/** Distance totale (m) d'un parcours, retour compris. */
export function distanceParcours(m: Matrices, depart: number, ordre: number[], arrivee: number | null): number {
  return coutParcours(m.distances, depart, ordre, arrivee)
}

// ── Polyligne encodée (format Google / ORS, précision 5) ─────────────────────

export function encoderPolyligne(points: Array<[number, number]>, precision = 5): string {
  const f = 10 ** precision
  let out = ''
  let pLat = 0; let pLng = 0
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1
    let r = ''
    while (s >= 0x20) { r += String.fromCharCode((0x20 | (s & 0x1f)) + 63); s >>= 5 }
    return r + String.fromCharCode(s + 63)
  }
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * f); const iLng = Math.round(lng * f)
    out += enc(iLat - pLat) + enc(iLng - pLng)
    pLat = iLat; pLng = iLng
  }
  return out
}

export function decoderPolyligne(s: string, precision = 5): Array<[number, number]> {
  const f = 10 ** precision
  const out: Array<[number, number]> = []
  let i = 0; let lat = 0; let lng = 0
  const lire = () => {
    let r = 0; let shift = 0; let b: number
    do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    return r & 1 ? ~(r >> 1) : r >> 1
  }
  while (i < s.length) { lat += lire(); lng += lire(); out.push([lat / f, lng / f]) }
  return out
}
