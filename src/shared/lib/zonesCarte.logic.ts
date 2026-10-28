// Limites des zones de Brumath sur la carte — PUR, testé (zonesCarte.logic.test.ts).
// Source : chaque numéro connu du référentiel (`referentiel_rues.numeros`) prend la zone de sa rue
// (`zones_rues`, fichier de l'utilisateur). Une rue coupée entre deux zones ou absente du fichier prend,
// numéro par numéro, la zone du numéro voisin (même règle que `appliquer_zones_tournee`).
// Dessin : chaque numéro « possède » la surface la plus proche de lui (cellule de Voronoï), limitée à
// `rayonM` autour de lui ; les cellules d'une zone forment la zone, la frontière est la limite entre deux
// numéros voisins de zones différentes. Les limites suivent donc les maisons, pas un tracé à la main.
import { Delaunay } from 'd3-delaunay'

export type LatLng = [number, number]

export interface RueReferentiel {
  rue_cle: string
  /** { "12": [lat, lng], … } */
  numeros: Record<string, [number, number]> | null
}

export interface ZoneRue { rue_cle: string; zones: string[] }

export interface PointZone { lat: number; lng: number; zone: string }

/** Rayon autour d'un numéro dans lequel la carte colorie sa zone (mètres). */
export const RAYON_ZONE_M = 90

/** Numéros du référentiel avec leur zone (zone voisine pour une rue coupée ou absente du fichier). */
export function pointsZones(rues: RueReferentiel[], zonesRues: ZoneRue[]): PointZone[] {
  const parRue = new Map(zonesRues.map(z => [z.rue_cle, z.zones]))
  const surs: PointZone[] = []
  const aDeviner: Array<{ lat: number; lng: number; permises: string[] | null }> = []
  for (const r of rues) {
    const zones = parRue.get(r.rue_cle) ?? null
    for (const pos of Object.values(r.numeros ?? {})) {
      if (!Array.isArray(pos) || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue
      if (zones?.length === 1) surs.push({ lat: pos[0], lng: pos[1], zone: zones[0] })
      else aDeviner.push({ lat: pos[0], lng: pos[1], permises: zones })
    }
  }
  const devines = aDeviner.map(p => {
    let meilleur: PointZone | null = null; let d = Infinity
    for (const s of surs) {
      if (p.permises && !p.permises.includes(s.zone)) continue
      const x = (s.lat - p.lat) ** 2 + ((s.lng - p.lng) * 0.66) ** 2
      if (x < d) { d = x; meilleur = s }
    }
    const zone = meilleur?.zone ?? p.permises?.[0] ?? null
    return zone ? { lat: p.lat, lng: p.lng, zone } : null
  }).filter((p): p is PointZone => p != null)
  return [...surs, ...devines]
}

export interface DessinZone {
  zone: string
  /** Cellules de la zone (anneaux lat / lng), à remplir sans contour. */
  cellules: LatLng[][]
  /** Où écrire le nom de la zone (point médian de ses numéros). */
  etiquette: LatLng
  nb: number
}

export interface DessinZones { zones: DessinZone[]; frontieres: LatLng[][] }

const M_LAT = 110_574
/** Distance maximale au plus proche numéro de la même zone pour compter dans le dessin (mètres). */
export const ISOLE_M = 110

/** Polygone convexe `poly` coupé par le polygone convexe `fenetre` (les deux dans le sens trigonométrique). */
function couper(poly: Array<[number, number]>, fenetre: Array<[number, number]>): Array<[number, number]> {
  let out = poly
  for (let i = 0; i < fenetre.length && out.length; i++) {
    const a = fenetre[i]; const b = fenetre[(i + 1) % fenetre.length]
    const dedans = (p: [number, number]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
    const inter = (p: [number, number], q: [number, number]): [number, number] => {
      const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1]
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
      const t = den === 0 ? 0 : ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
    }
    const entree = out; out = []
    for (let k = 0; k < entree.length; k++) {
      const p = entree[k]; const q = entree[(k + 1) % entree.length]
      if (dedans(q)) { if (!dedans(p)) out.push(inter(p, q)); out.push(q) }
      else if (dedans(p)) out.push(inter(p, q))
    }
  }
  return out
}

/** Segment [p, q] gardé seulement à moins de `r` de `c` (null si rien ne reste). */
function segmentDansDisque(p: [number, number], q: [number, number], c: [number, number], r: number): [[number, number], [number, number]] | null {
  const dx = q[0] - p[0]; const dy = q[1] - p[1]
  const fx = p[0] - c[0]; const fy = p[1] - c[1]
  const A = dx * dx + dy * dy
  if (A === 0) return null
  const B = 2 * (fx * dx + fy * dy); const C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C
  if (disc <= 0) return null
  const s = Math.sqrt(disc)
  const t0 = Math.max(0, (-B - s) / (2 * A)); const t1 = Math.min(1, (-B + s) / (2 * A))
  if (t1 <= t0) return null
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]]
}

/** Zones coloriées + frontières entre zones, à partir des numéros et de leur zone. */
export function dessinerZones(points: PointZone[], rayonM = RAYON_ZONE_M, cotes = 16): DessinZones {
  // Un point par mètre près (des numéros partagent la même position).
  const vus = new Map<string, PointZone>()
  for (const p of points) {
    const cle = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
    if (!vus.has(cle)) vus.set(cle, p)
  }
  const tous = [...vus.values()]
  // Un numéro seul dans son coin (adresse mal placée dans les champs, sur l'autoroute…) ne dessine pas de zone :
  // il lui faut un voisin de la même zone à moins de `ISOLE_M`.
  const pts = tous.filter(p => tous.some(q => q !== p && q.zone === p.zone && Math.hypot((q.lat - p.lat) * M_LAT, (q.lng - p.lng) * 73_000) <= ISOLE_M))
  if (pts.length < 3) return { zones: [], frontieres: [] }
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const lng0 = pts.reduce((s, p) => s + p.lng, 0) / pts.length
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const xy = pts.map(p => [(p.lng - lng0) * mLng, (p.lat - lat0) * M_LAT] as [number, number])
  const versLatLng = ([x, y]: [number, number]): LatLng => [lat0 + y / M_LAT, lng0 + x / mLng]
  const xs = xy.map(p => p[0]); const ys = xy.map(p => p[1])
  const delaunay = Delaunay.from(xy)
  const voronoi = delaunay.voronoi([Math.min(...xs) - rayonM, Math.min(...ys) - rayonM, Math.max(...xs) + rayonM, Math.max(...ys) + rayonM])

  const parZone = new Map<string, DessinZone & { lats: number[]; lngs: number[] }>()
  pts.forEach((p, i) => {
    const cellule = voronoi.cellPolygon(i)
    if (!cellule) return
    const c = xy[i]
    const disque = Array.from({ length: cotes }, (_, k) => {
      const a = (2 * Math.PI * k) / cotes
      return [c[0] + rayonM * Math.cos(a), c[1] + rayonM * Math.sin(a)] as [number, number]
    })
    // d3 rend la cellule fermée (dernier point = premier) : on retire le doublon avant de couper par le disque.
    const anneau = couper(cellule.slice(0, -1) as Array<[number, number]>, disque)
    if (anneau.length < 3) return
    const z = parZone.get(p.zone) ?? { zone: p.zone, cellules: [], etiquette: [p.lat, p.lng] as LatLng, nb: 0, lats: [], lngs: [] }
    z.cellules.push(anneau.map(versLatLng)); z.nb++; z.lats.push(p.lat); z.lngs.push(p.lng)
    parZone.set(p.zone, z)
  })

  // Frontières : arête de Voronoï entre deux numéros voisins de zones différentes (bissectrice), gardée
  // à moins de `rayonM` des deux (même distance des deux : un seul disque suffit).
  const { halfedges, triangles } = delaunay
  const centres = voronoi.circumcenters
  const frontieres: LatLng[][] = []
  for (let e = 0; e < halfedges.length; e++) {
    const f = halfedges[e]
    if (f < e) continue // arête du bord (-1) ou déjà vue
    const a = triangles[e]; const b = triangles[e % 3 === 2 ? e - 2 : e + 1]
    if (pts[a].zone === pts[b].zone) continue
    const t1 = Math.floor(e / 3); const t2 = Math.floor(f / 3)
    const p: [number, number] = [centres[2 * t1], centres[2 * t1 + 1]]
    const q: [number, number] = [centres[2 * t2], centres[2 * t2 + 1]]
    const seg = segmentDansDisque(p, q, xy[a], rayonM)
    if (seg) frontieres.push(seg.map(versLatLng))
  }

  const mediane = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const zones = [...parZone.values()]
    .map(({ lats, lngs, ...z }) => ({ ...z, etiquette: [mediane(lats), mediane(lngs)] as LatLng }))
    .sort((x, y) => x.zone.localeCompare(y.zone, 'fr', { numeric: true }))
  return { zones, frontieres }
}
