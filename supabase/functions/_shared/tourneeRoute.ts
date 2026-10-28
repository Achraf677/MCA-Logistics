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
//    Puis « perturbations » (recherche locale itérée) : on casse l'ordre en 4 morceaux qu'on
//    remet dans un autre ordre (« double pont »), on réoptimise, on garde si c'est plus court.
//    Sort des minimums locaux que 2-opt seul ne quitte pas. Hasard à graine fixe : déterministe.
// 3. Découpage des appels : matrice ORS en blocs ≤ 3 500 éléments ; tracé IGN ≤ 17 points
//    (départ + 15 étapes + arrivée), tracé ORS ≤ 50 points.
// 4. `ordonnerTournee` = l'ordre complet : village par village, zones de Brumath 1 → 7, chaque rue d'un seul
//    tenant (`penaliserChangementsRue`), numéros rangés dans chaque rue (`rangerNumeros`).

export interface ArretAPlacer {
  id: string
  lat: number | null
  lng: number | null
  numero: string | null
  rang: number
  /** Village de l'arrêt : la tournée fait village par village (`penaliserChangementsVillage`). */
  commune?: string | null
  /** Rue de l'arrêt : une rue se fait d'un seul tenant (`penaliserChangementsRue`), numéros dans l'ordre (`rangerNumeros`). */
  rue?: string | null
}

export interface Noeud {
  cle: string
  lat: number
  lng: number
  /** Ids des arrêts du nœud, dans l'ordre de passage (numéros croissants, pairs puis impairs). */
  arrets: string[]
  /** Plus petit rang de la feuille (sert à l'ordre de référence « feuille »). */
  rang: number
  /** Village du nœud (celui de son premier arrêt), null si inconnu. */
  commune: string | null
  /** Rue et numéro du premier arrêt du nœud (null si inconnus). */
  rue?: string | null
  numero?: string | null
}

export interface Point {
  lat: number
  lng: number
}

/** Limites ORS (openrouteservice.org/restrictions, relevées le 18/10/2026). */
export const MATRICE_MAX_ELEMENTS = 3500
export const ITINERAIRE_MAX_POINTS = 50
/** Itinéraire IGN (Géoplateforme) : 15 étapes intermédiaires au plus (vérifié le 18/10/2026). */
export const IGN_MAX_POINTS = 17
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
      return {
        cle, lat: n.lat, lng: n.lng, arrets: tries.map(a => a.id), rang: Math.min(...n.arrets.map(a => a.rang)),
        commune: tries[0].commune?.trim() || null, rue: tries[0].rue?.trim() || null, numero: tries[0].numero ?? null,
      }
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

/**
 * Coût optimisé = le plus COURT par la route (mètres). Le temps n'est qu'un départage entre
 * deux trajets de même longueur (0,05 m par seconde : 10 s d'écart = 0,5 m).
 */
export function matriceCouts(m: Matrices, poidsTemps = 0.05): number[][] {
  return m.distances.map((l, i) => l.map((d, j) => d + poidsTemps * m.durees[i][j]))
}

/** Coût d'un changement de village (1 000 km) : bien plus que tout gain possible en route. */
export const PENALITE_VILLAGE = 1_000_000

/**
 * Village par village : chaque passage d'un village à un autre coûte `PENALITE_VILLAGE` en plus.
 * Le plus court devient alors « le moins de changements de village possible (chaque village en un
 * seul bloc), puis le plus court par la route ». `communes[i]` = village du nœud i (null = départ
 * ou village inconnu : aucune pénalité). Les mètres réels se lisent toujours sur `m.distances`.
 */
export function penaliserChangementsVillage(c: number[][], communes: (string | null)[], penalite = PENALITE_VILLAGE): number[][] {
  const cle = communes.map(v => (v ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : null))
  return c.map((l, i) => l.map((v, j) => (cle[i] && cle[j] && cle[i] !== cle[j] ? v + penalite : v)))
}

/**
 * Communes déléguées = un seul village pour le solveur (clés normalisées) : Mittelhausen, Hohatzenheim et Gingsheim font
 * Wingersheim les Quatre Bans ; Keffendorf fait Ohlungen (CLAUDE.md § 2). L'affichage garde
 * le nom de la feuille : seule la clé de regroupement change.
 */
const ALIAS_VILLAGES: Record<string, string> = {
  'mittelhausen': 'wingersheim', 'hohatzenheim': 'wingersheim', 'gingsheim': 'wingersheim',
  'wingersheim les quatre bans': 'wingersheim', 'keffendorf': 'ohlungen',
}

/** Clé de village pour le solveur : sans accents ni casse, sans le « ZONE n » de Brumath, communes déléguées regroupées. */
export function cleVillage(commune: string | null | undefined): string | null {
  const k = (commune ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ zone \d+$/, '')
  return k ? (ALIAS_VILLAGES[k] ?? k) : null
}

/**
 * Coût d'un changement de village dans la recherche (mètres) : assez pour que chaque village se fasse d'un bloc, pas assez
 * pour interdire de couper un village en deux quand ça évite un vrai détour. Réglé sur le banc du 28/10/2026.
 */
export const PENALITE_CHANGEMENT_VILLAGE = 2000

const cleNorm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Numéro de zone d'une clé « Brumath ZONE 3 » (feuille de Brumath) ; null pour un village ordinaire. */
export function rangZone(cle: string | null | undefined): number | null {
  const m = /\bzone (\d+)$/.exec(cleNorm(cle ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Zones de Brumath dans l'ordre 1 → 7 PENDANT la recherche (et non réordonnées après coup) : toute arête entre deux nœuds
 * de zone qui saute une zone ou revient en arrière coûte `PENALITE_VILLAGE` de plus. Le solveur choisit alors, zone par
 * zone, le point d'entrée et de sortie le plus court. `cles[i]` = clé du nœud i (« Brumath ZONE 3 ») ; zones absentes de
 * la tournée ignorées (la suivante présente suit). Sans zone dans les clés : matrice inchangée.
 */
export function penaliserOrdreZones(c: number[][], cles: (string | null)[], penalite = PENALITE_VILLAGE): number[][] {
  const rangs = cles.map(k => rangZone(k))
  const presentes = [...new Set(rangs.filter((r): r is number => r != null))].sort((a, b) => a - b)
  if (presentes.length < 2) return c
  const place = new Map(presentes.map((r, i) => [r, i]))
  return c.map((l, i) => l.map((v, j) => {
    const a = rangs[i]; const b = rangs[j]
    if (a == null || b == null) return v
    const ecart = place.get(b)! - place.get(a)!
    return ecart === 0 || ecart === 1 ? v : v + penalite
  }))
}

/**
 * Filet de sécurité : les zones de Brumath se font dans l'ordre 1, 2, … jusqu'à la zone 7 (fin) ; normalement déjà acquis par
 * `penaliserOrdreZones` (sans effet dans ce cas).
 * `ordre` = indices de nœuds dans l'ordre trouvé ; `cles[i]` = village / zone du nœud i. Les blocs de zone
 * gardent leur place dans la tournée mais se rangent par numéro ; chaque bloc garde son ordre interne.
 */
export function ordonnerZones(ordre: number[], cles: (string | null)[]): number[] {
  const blocs: Array<{ cle: string | null; noeuds: number[] }> = []
  for (const n of ordre) {
    const cle = cles[n] ? cleNorm(cles[n]!) : null
    const d = blocs[blocs.length - 1]
    if (d && d.cle === cle) d.noeuds.push(n)
    else blocs.push({ cle, noeuds: [n] })
  }
  const places = blocs.map((b, i) => (rangZone(b.cle) != null ? i : -1)).filter(i => i >= 0)
  const tries = places.map(i => blocs[i]).sort((a, b) => rangZone(a.cle)! - rangZone(b.cle)!)
  const out = [...blocs]
  places.forEach((i, k) => { out[i] = tries[k] })
  return out.flatMap(b => b.noeuds)
}

/**
 * Coût d'un changement de rue (mètres) : une rue se fait d'un seul tenant. Bien moins qu'un village (on accepte
 * de couper une rue si ça évite un vrai détour), assez pour ne plus revenir trois fois dans la même rue.
 * Réglé sur le banc du 28/10/2026 (tournées réelles de Brumath, matrice routière OSRM).
 */
export const PENALITE_RUE = 300

/** Clé de rue : « Rue du Général Duport » = « rue du general duport » (accents, apostrophes, casse ignorés). */
export function cleRue(rue: string | null | undefined): string | null {
  const k = rue ? cleNorm(rue) : ''
  return k || null
}

/**
 * Changer de rue coûte `penalite` en plus (`rues[i]` = rue du nœud i, null = départ ou rue inconnue : rien).
 * Le nombre minimal de changements (une fois par rue) est payé par TOUT ordre : seul un passage en plusieurs fois
 * dans une même rue coûte vraiment.
 */
export function penaliserChangementsRue(c: number[][], rues: (string | null | undefined)[], penalite = PENALITE_RUE): number[][] {
  const cle = rues.map(cleRue)
  if (cle.filter(Boolean).length < 2) return c
  return c.map((l, i) => l.map((v, j) => (cle[i] && cle[j] && cle[i] !== cle[j] ? v + penalite : v)))
}

/** Numéro de rue utilisable pour trier (« 28A » → 28) ; null si absent. */
function numeroRue(n: string | null | undefined): number | null {
  const m = (n ?? '').match(/\d+/)
  return m ? Number(m[0]) : null
}

/** Tolérance pour ranger une rue dans l'ordre des numéros : au plus ce surplus de route (mètres) par passage de rue. */
export const TOLERANCE_NUMEROS_M = 150

/**
 * Dans chaque passage d'une rue (nœuds consécutifs de même rue, au moins 3), les numéros dans l'ordre (croissant
 * ou décroissant, le sens le plus court avec la rue d'avant et celle d'après) si ça ne rallonge pas de plus de
 * `tolerance` mètres : le livreur remonte la rue, il ne fait pas 44 → 31 → 34 → 23 → 37. `d` = distances réelles,
 * `rues[i]` / `numeros[i]` = rue / numéro du nœud i. Modifie et renvoie `ordre`.
 */
export function rangerNumeros(
  d: number[][], depart: number, ordre: number[], arrivee: number | null,
  rues: (string | null | undefined)[], numeros: (string | null | undefined)[], tolerance = TOLERANCE_NUMEROS_M,
): number[] {
  const cle = rues.map(cleRue)
  const chemin = (avant: number, seg: number[], apres: number | null) => {
    let t = 0; let p = avant
    for (const n of seg) { t += d[p][n]; p = n }
    return t + (apres == null ? 0 : d[p][apres])
  }
  for (let i = 0; i < ordre.length;) {
    let j = i
    while (j < ordre.length && cle[ordre[j]] && cle[ordre[j]] === cle[ordre[i]]) j++
    if (j - i >= 3 && ordre.slice(i, j).every(n => numeroRue(numeros[n]) != null)) {
      const seg = ordre.slice(i, j)
      const avant = i === 0 ? depart : ordre[i - 1]
      const apres = j < ordre.length ? ordre[j] : arrivee
      const croissant = [...seg].sort((a, b) => numeroRue(numeros[a])! - numeroRue(numeros[b])! || a - b)
      const pairs = croissant.filter(n => numeroRue(numeros[n])! % 2 === 0)
      const impairs = croissant.filter(n => numeroRue(numeros[n])! % 2 === 1)
      // Rue remontée dans l'ordre des numéros, dans un sens ou l'autre, ou un côté à l'aller et l'autre au retour.
      const candidats = [
        croissant, [...croissant].reverse(),
        ...(pairs.length && impairs.length ? [
          [...pairs, ...[...impairs].reverse()], [...impairs, ...[...pairs].reverse()],
          [...[...pairs].reverse(), ...impairs], [...[...impairs].reverse(), ...pairs],
        ] : []),
      ]
      const actuel = chemin(avant, seg, apres)
      let meilleur = candidats[0]; let cout = chemin(avant, meilleur, apres)
      for (const cand of candidats.slice(1)) {
        const x = chemin(avant, cand, apres)
        if (x + EPS < cout) { meilleur = cand; cout = x }
      }
      if (cout <= actuel + tolerance) ordre.splice(i, j - i, ...meilleur)
    }
    i = Math.max(j, i + 1)
  }
  return ordre
}

/**
 * L'ordre complet d'une tournée, tel que l'Edge le calcule : le plus court par la route, village par village,
 * zones de Brumath 1 → 7, chaque rue d'un seul tenant, numéros dans l'ordre. `m` = matrices (index 0 = départ,
 * index i = nœud i - 1), `noeuds` = `regrouperNoeuds(...)` (commune = « Brumath ZONE 3 » pour une zone),
 * `arrivee` = 0 (retour au départ) ou null. Renvoie les index (1..n) dans l'ordre de passage.
 */
export function ordonnerTournee(m: Matrices, noeuds: Noeud[], arrivee: number | null, opts: OptionsSolveur = {}): number[] {
  const cles = [null, ...noeuds.map(n => n.commune)]
  // Clé de rue = village + rue (deux « Rue Principale » de deux villages restent deux rues).
  const rues = [null, ...noeuds.map(n => (n.rue ? `${n.commune ?? ''} ${n.rue}` : null))]
  const numeros = [null, ...noeuds.map(n => n.numero ?? null)]
  // Village = clé regroupée (communes déléguées, sans le « ZONE n ») ; les zones de Brumath gardent leur pénalité dure.
  const villages = [null, ...noeuds.map(n => cleVillage(n.commune))]
  // Brumath reste « dur » comme avant : tout passage entre deux zones, ou entre une zone et un autre village, coûte
  // PENALITE_VILLAGE (chaque zone d'un seul bloc, Brumath d'un seul tenant). Seuls les villages ordinaires sont « doux ».
  // Une tournée qui passe par des zones de Brumath garde la règle dure partout (la recherche s'y perd quand les deux
  // règles se mélangent : banc du 28/10/2026, jusqu'à +8 km) ; seules les communes déléguées y sont regroupées.
  const avecZones = noeuds.some(n => rangZone(n.commune) != null)
  const doux = avecZones ? PENALITE_VILLAGE : (opts.penaliteVillage ?? PENALITE_CHANGEMENT_VILLAGE)
  const parCles = avecZones ? [null, ...noeuds.map(n => { const v = cleVillage(n.commune); const z = rangZone(n.commune); return v && z != null ? `${v} zone ${z}` : v })] : villages
  const couts = penaliserChangementsRue(penaliserOrdreZones(penaliserChangementsVillage(matriceCouts(m), parCles, doux), cles), rues)
  const ordre = ordonnerZones(resoudre(couts, 0, noeuds.map((_, i) => i + 1), arrivee, opts), cles)
  return rangerNumeros(m.distances, 0, ordre, arrivee, rues, numeros)
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

/** Fenêtre glissante : 10 nœuds consécutifs réordonnés EXACTEMENT, bouts (précédent / suivant) fixés. */
const FENETRE = 10

/**
 * Polissage final : tout groupe de 10 nœuds qui se suivent est le meilleur possible (calcul exact),
 * ce que 2-opt / Or-opt seuls ne garantissent pas (un petit quartier visité dans un mauvais ordre).
 * Modifie `ordre` ; s'arrête quand plus rien ne s'améliore ou à la limite de temps.
 */
export function polirParFenetres(c: number[][], depart: number, ordre: number[], arrivee: number | null, limite: number): void {
  const n = ordre.length
  if (n <= EXACT_MAX) return
  let ameliore = true
  while (ameliore && Date.now() < limite) {
    ameliore = false
    for (let i = 0; i + FENETRE <= n && Date.now() < limite; i++) {
      const fen = ordre.slice(i, i + FENETRE)
      const avant = i === 0 ? depart : ordre[i - 1]
      const apres = i + FENETRE < n ? ordre[i + FENETRE] : arrivee
      const ancien = coutParcours(c, avant, fen, apres)
      const mieux = exact(c, avant, fen, apres)
      if (coutParcours(c, avant, mieux, apres) + EPS < ancien) {
        ordre.splice(i, FENETRE, ...mieux)
        ameliore = true
      }
    }
  }
}

export interface OptionsSolveur {
  /** Garde-fou de temps (ms) ; l'ordre reste valide s'il est atteint. */
  limiteMs?: number
  /** Nombre de perturbations (recherche locale itérée) après la première optimisation. */
  perturbations?: number
  /** Coût (m) d'un changement de village dans `ordonnerTournee` (défaut `PENALITE_CHANGEMENT_VILLAGE`). */
  penaliteVillage?: number
}

/** Hasard reproductible (même graine = mêmes tirages). */
function hasard(graine: number): () => number {
  let x = graine >>> 0 || 1
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 }
}

/** 2-opt + Or-opt jusqu'à stabilité (ou limite de temps). Modifie `ordre`. */
function rechercheLocale(c: number[][], depart: number, ordre: number[], arrivee: number | null, limite: number) {
  while (Date.now() < limite) {
    if (passe2Opt(c, depart, ordre, arrivee)) continue
    if (passeOrOpt(c, depart, ordre, arrivee)) continue
    return
  }
}

/** « Double pont » : A B C D → A C B D (coupes tirées au hasard). */
function doublePont(ordre: number[], rnd: () => number): number[] {
  const n = ordre.length
  const coupes = [1 + Math.floor(rnd() * (n - 3)), 0, 0]
  coupes[1] = coupes[0] + 1 + Math.floor(rnd() * (n - coupes[0] - 2))
  coupes[2] = coupes[1] + 1 + Math.floor(rnd() * (n - coupes[1] - 1))
  const [i, j, k] = coupes
  return [...ordre.slice(0, i), ...ordre.slice(j, k), ...ordre.slice(i, j), ...ordre.slice(k)]
}

/**
 * Ordre de passage des nœuds `noeuds` (indices dans la matrice), du `depart` à l'`arrivee`
 * (null = parcours ouvert). Renvoie les indices dans l'ordre.
 */
export function resoudre(c: number[][], depart: number, noeuds: number[], arrivee: number | null, opts: OptionsSolveur = {}): number[] {
  if (noeuds.length <= 1) return [...noeuds]
  if (noeuds.length <= EXACT_MAX) return exact(c, depart, noeuds, arrivee)
  const duree = opts.limiteMs ?? 3000
  const limite = Date.now() + duree
  // Le dernier polissage a sa part du temps : la limite donnée est TENUE (les fonctions Supabase coupent vers 2 s).
  const avantPolissage = limite - Math.min(150, duree * 0.2)
  let meilleur = plusProcheVoisin(c, depart, noeuds)
  rechercheLocale(c, depart, meilleur, arrivee, avantPolissage)
  if (noeuds.length < 8) return meilleur
  polirParFenetres(c, depart, meilleur, arrivee, avantPolissage)
  let cout = coutParcours(c, depart, meilleur, arrivee)
  const rnd = hasard(noeuds.length * 7919 + depart)
  const essais = opts.perturbations ?? 300
  for (let e = 0; e < essais && Date.now() < avantPolissage; e++) {
    const essai = doublePont(meilleur, rnd)
    rechercheLocale(c, depart, essai, arrivee, avantPolissage)
    const ce = coutParcours(c, depart, essai, arrivee)
    if (ce + EPS < cout) { meilleur = essai; cout = ce }
  }
  // Dernier polissage, dans le temps réservé.
  polirParFenetres(c, depart, meilleur, arrivee, limite)
  return meilleur
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

/** Nœuds dans l'ordre DÉJÀ enregistré sur les arrêts (plus petit `ordre` du nœud ; sans ordre : à la fin, par rang). */
export function noeudsDansOrdre(noeuds: Noeud[], ordreParArret: Map<string, number | null>): Noeud[] {
  const cle = (n: Noeud) => Math.min(...n.arrets.map(id => ordreParArret.get(id) ?? Infinity))
  return [...noeuds].sort((a, b) => {
    const x = cle(a); const y = cle(b)
    if (x !== y) return x === Infinity ? 1 : y === Infinity ? -1 : x - y
    return a.rang - b.rang
  })
}

/**
 * Heures de passage quand on connaît déjà les tronçons du parcours : `etapes[i]` = trajet qui
 * arrive au nœud i (départ → 1er nœud, puis nœud à nœud). `noeud` = i + 1 (comme `passages`).
 */
export function passagesDepuisEtapes(etapes: Array<{ distance: number; duration: number }>, arretS = ARRET_S): Passage[] {
  const out: Passage[] = []
  let t = 0; let d = 0
  etapes.forEach((e, i) => {
    t += e.duration + (i > 0 ? arretS : 0)
    d += e.distance
    out.push({ noeud: i + 1, etaMin: Math.round(t / 60), distanceM: Math.round(d) })
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
