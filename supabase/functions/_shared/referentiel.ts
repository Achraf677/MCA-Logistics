// Référentiel des tournées de colis (table `referentiel_rues`) — PUR, testé (referentiel.test.ts).
// Repris de l'outil de tournée d'origine : pour chaque village du secteur, ses rues (nom
// officiel), la position de chaque numéro, l'ORDRE HABITUEL du livreur (« le fichier ») et les
// relais connus. Sert à la lecture d'une feuille de route : le salarié n'a rien à corriger.
//   - commune : retrouvée dans le SECTEUR (« 601 - GEUDERTHEIM EGLISE »), sinon dans le bandeau ;
//   - rue : nom lu rapproché du nom officiel (accents, tirets, « de / la / des », pluriels) ;
//   - position : numéro exact, sinon numéro voisin (même côté de préférence, écart ≤ 20), sinon
//     milieu de la rue ;
//   - relais : adresse connue comme relais = arrêt relais, même sans « RC » imprimé ;
//   - ordre habituel : rang de la rue dans le fichier (rue inconnue : juste après la
//     précédente du même village, en tête de village sinon).

export interface RueRef {
  commune: string
  commune_cle: string
  rue: string
  rue_cle: string
  rue_souple: string
  /** Place de la rue dans l'ordre habituel (fichier) ; null = hors fichier. */
  rang: number | null
  /** Numéro → [lat, lng]. */
  numeros: Record<string, [number, number]>
  centre: [number, number] | null
  /** Numéros qui sont des relais ; « * » = toute la rue. */
  relais: string[]
}

const MOTS_VIDES = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'd', 'l', 'a', 'au', 'aux', 'et'])

/** Minuscules, sans accents, apostrophes / tirets / points en espaces. */
export function cle(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`\-_.]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => ABREVIATIONS[w] ?? w).join(' ')
}

/** Abréviations imprimées sur les feuilles (« rue du Mal de Lattre de Tassigny »). */
const ABREVIATIONS: Record<string, string> = {
  mal: 'marechal', gal: 'general', dr: 'docteur', pr: 'professeur', av: 'avenue', bd: 'boulevard', pl: 'place', imp: 'impasse',
}

/** Clé « souple » : sans mots vides, pluriels retirés (« rue des pres » = « rue pre »). */
export function cleSouple(s: string | null | undefined): string {
  return cle(s).split(' ').filter(w => w && !MOTS_VIDES.has(w)).map(w => (w.length > 3 ? w.replace(/s$/, '') : w)).join(' ')
}

function colle(s: string | null | undefined): string {
  return cle(s).replace(/ /g, '')
}

export interface Referentiel {
  /** Communes, de la plus longue à la plus courte (« Waltenheim-sur-Zorn » avant « Zorn »). */
  communes: Array<{ cle: string; colle: string; nom: string }>
  exact: Map<string, RueRef>
  souple: Map<string, RueRef>
  /** Premier rang du fichier par commune (rue inconnue : rangée en tête de village). */
  premierRang: Map<string, number>
  /** Rues de chaque commune (clé de commune → rues), pour le rapprochement approché. */
  rues: Map<string, RueRef[]>
}

export function indexer(rues: RueRef[]): Referentiel {
  const noms = new Map<string, string>()
  const exact = new Map<string, RueRef>()
  const souple = new Map<string, RueRef>()
  const premierRang = new Map<string, number>()
  const parCommune = new Map<string, RueRef[]>()
  for (const r of rues) {
    const l = parCommune.get(r.commune_cle) ?? []
    l.push(r); parCommune.set(r.commune_cle, l)
    if (!noms.has(r.commune_cle)) noms.set(r.commune_cle, r.commune)
    const k = `${r.commune_cle}|${r.rue_cle}`
    if (!exact.has(k)) exact.set(k, r)
    const ks = `${r.commune_cle}|${r.rue_souple}`
    if (!souple.has(ks)) souple.set(ks, r)
    if (r.rang != null) premierRang.set(r.commune_cle, Math.min(premierRang.get(r.commune_cle) ?? Infinity, r.rang))
  }
  const communes = [...noms.entries()].map(([c, nom]) => ({ cle: c, colle: colle(nom), nom }))
    .sort((a, b) => b.colle.length - a.colle.length)
  return { communes, exact, souple, premierRang, rues: parCommune }
}

/** Commune du référentiel contenue dans un texte (secteur, bandeau). */
export function trouverCommune(ref: Referentiel, texte: string | null | undefined): string | null {
  const t = colle(texte)
  if (!t) return null
  return ref.communes.find(c => c.colle && t.includes(c.colle))?.nom ?? null
}

export function trouverRue(ref: Referentiel, commune: string, rue: string | null | undefined): RueRef | null {
  if (!rue) return null
  const c = cle(commune)
  return ref.exact.get(`${c}|${cle(rue)}`) ?? ref.souple.get(`${c}|${cleSouple(rue)}`) ?? null
}

/** Distance d'édition (Levenshtein) entre deux chaînes courtes. */
export function distanceEdition(a: string, b: string): number {
  const m = a.length; const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

/**
 * Rue lue avec une faute (« rue des carriers », « rue du mal de latte de tassigny ») : la rue de la commune
 * dont le nom est le plus proche (≤ 20 % d'écart, au moins 1 lettre), à condition qu'elle soit seule à ce niveau.
 */
export function trouverRueProche(ref: Referentiel, commune: string, rue: string | null | undefined): RueRef | null {
  const lue = colle(rue)
  if (lue.length < 5) return null
  let meilleur: RueRef | null = null; let dMeilleur = Infinity; let egalite = false
  for (const r of ref.rues.get(cle(commune)) ?? []) {
    const nom = colle(r.rue)
    const d = Math.min(distanceEdition(lue, nom), distanceEdition(cleSouple(rue).replace(/ /g, ''), cleSouple(r.rue).replace(/ /g, '')))
    if (d < dMeilleur) { meilleur = r; dMeilleur = d; egalite = false } else if (d === dMeilleur) egalite = true
  }
  const tolerance = Math.max(1, Math.floor(lue.length * 0.2))
  return meilleur && !egalite && dMeilleur <= tolerance ? meilleur : null
}

const norm = (n: string | null | undefined) => String(n ?? '').toUpperCase().replace(/\s+/g, '')

/**
 * Rue illisible : on la déduit de sa PLACE sur la feuille (les rues d'une feuille suivent l'ordre habituel du
 * fichier) et de ses numéros. Candidates = rues dont le rang est compris entre la rue reconnue d'avant et celle
 * d'après ; retenue = celle qui possède le plus de numéros lus (au moins un, sans égalité).
 */
export function trouverRueParPlace(
  ref: Referentiel, commune: string, numeros: Array<string | null>, rangAvant: number | null, rangApres: number | null,
): RueRef | null {
  const cands = (ref.rues.get(cle(commune)) ?? []).filter(r => r.rang != null
    && (rangAvant == null || (r.rang as number) > rangAvant) && (rangApres == null || (r.rang as number) < rangApres))
  const lus = numeros.map(norm).filter(Boolean)
  if (!cands.length || !lus.length) return null
  const notes = cands.map(r => ({ r, n: lus.filter(x => r.numeros[x] != null || (r.relais ?? []).map(norm).includes(x)).length }))
    .sort((a, b) => b.n - a.n)
  return notes[0].n >= 1 && (notes.length === 1 || notes[0].n > notes[1].n) ? notes[0].r : null
}

/**
 * Numéro mal lu (4 pour A, 8 pour B, 0 pour D) : si le numéro lu n'existe pas dans la rue mais que sa variante
 * existe, c'est la variante. Sinon le numéro lu est gardé.
 */
export function corrigerNumero(r: RueRef, numero: string | null | undefined): string | null {
  const n = norm(numero)
  if (!n || r.numeros[n] != null || Object.keys(r.numeros).length === 0) return numero ?? null
  const dernier = n.slice(-1)
  const lettre = ({ '4': 'A', '8': 'B', '0': 'D' } as Record<string, string>)[dernier]
  if (lettre && r.numeros[n.slice(0, -1) + lettre] != null) return n.slice(0, -1) + lettre
  return numero ?? null
}

/** Part des numéros lus (non vides) qui existent dans la rue ; null si on ne peut pas juger (rue sans liste de numéros, aucun numéro lu). */
function appartenance(r: RueRef | null, numeros: Array<string | null>): number | null {
  const lus = numeros.map(norm).filter(Boolean)
  if (!r || !lus.length || Object.keys(r.numeros).length === 0) return null
  const connus = new Set(Object.keys(r.numeros).map(norm))
  const relais = (r.relais ?? []).map(norm)
  return lus.filter(n => connus.has(n) || relais.includes(n)).length / lus.length
}

/**
 * Photo penchée : les chiffres d'une ligne sont lus en face de la rue voisine (la rue d'au-dessus ou d'en dessous).
 * Un bloc d'arrêts consécutifs dont les numéros n'existent presque pas dans sa rue (< 60 %) mais existent TOUS dans
 * une seule des rues voisines (2 de chaque côté au plus) est rattaché à cette rue. Sans certitude, rien ne bouge.
 * Modifie `rues` en place.
 */
export function recalerParNumeros(numeros: Array<string | null>, communes: Array<string | null>, rues: Array<RueRef | null>): void {
  // Blocs : arrêts consécutifs de la même rue.
  const blocs: Array<{ de: number; a: number }> = []
  for (let i = 0; i < rues.length;) {
    let j = i
    while (j + 1 < rues.length && rues[j + 1] === rues[i] && communes[j + 1] === communes[i] && rues[i]) j++
    blocs.push({ de: i, a: j }); i = j + 1
  }
  const origine = blocs.map(b => rues[b.de])
  blocs.forEach((b, k) => {
    const propre = origine[k]
    const nums = numeros.slice(b.de, b.a + 1)
    const self = appartenance(propre, nums)
    if (!propre || self == null || self >= 0.6) return
    const candidats = new Set<RueRef>()
    for (let d = -2; d <= 2; d++) {
      const r = origine[k + d]
      if (d !== 0 && r && r !== propre && communes[blocs[k + d]?.de] === communes[b.de]) candidats.add(r)
    }
    const notes = [...candidats].map(r => ({ r, m: appartenance(r, nums) ?? 0 })).filter(x => x.m >= 0.999).sort((x, y) => y.m - x.m)
    // Une seule rue voisine convient (sinon : ambigu, on ne touche à rien).
    if (notes.length === 1) for (let i = b.de; i <= b.a; i++) rues[i] = notes[0].r
  })
}

/** Numéro → position : exact, sinon voisin du même côté (écart ≤ 20), sinon milieu de la rue. */
export function localiserNumero(r: RueRef, numero: string | null | undefined): { lat: number; lng: number; precision: 'numero' | 'rue' } | null {
  const n = String(numero ?? '').toUpperCase().replace(/\s+/g, '')
  const p = n ? r.numeros[n] : undefined
  if (p) return { lat: p[0], lng: p[1], precision: 'numero' }
  const voulu = parseInt(n, 10)
  if (!Number.isNaN(voulu)) {
    let meilleur: string | null = null; let ecart = Infinity
    for (const k of Object.keys(r.numeros)) {
      const v = parseInt(k, 10)
      if (Number.isNaN(v)) continue
      // L'autre côté de la rue compte comme 3 numéros de plus : on reste sur le bon trottoir.
      const d = Math.abs(v - voulu) + (v % 2 !== voulu % 2 ? 3 : 0)
      if (d < ecart) { ecart = d; meilleur = k }
    }
    if (meilleur != null && ecart <= 20) {
      const q = r.numeros[meilleur]
      return { lat: q[0], lng: q[1], precision: ecart < 1 ? 'numero' : 'rue' }
    }
  }
  return r.centre ? { lat: r.centre[0], lng: r.centre[1], precision: 'rue' } : null
}

export function estRelais(r: RueRef, numero: string | null | undefined): boolean {
  if (r.relais.includes('*')) return true
  const n = String(numero ?? '').toUpperCase().replace(/\s+/g, '')
  return !!n && r.relais.map(x => x.toUpperCase()).includes(n)
}

export interface ArretALire {
  commune: string | null
  cp: string | null
  secteur: string | null
  rue: string | null
  numero: string | null
  type: 'c' | 'rc' | 'col'
  a_verifier?: boolean
  motif?: string | null
}

export interface Enrichi {
  commune: string | null
  rue: string | null
  type: 'c' | 'rc' | 'col'
  lat: number | null
  lng: number | null
  geo_precision: 'numero' | 'rue' | null
  /** La rue est connue du référentiel. */
  rue_connue: boolean
  /** Rang de la rue dans l'ordre habituel ; null = inconnu. */
  ref_rang: number | null
  /** Premier rang du village dans l'ordre habituel (pour ranger une rue inconnue). */
  ref_rang_commune: number | null
  a_verifier?: boolean
  motif?: string | null
}

const MOTIF_COMMUNE = 'commune absente (bandeau non lu)'

/** Commune retrouvée par le secteur : le motif « bandeau non lu » n'a plus lieu d'être. */
function sansMotifCommune(motif: string | null | undefined): string | null {
  const reste = String(motif ?? '').split(' · ').filter(m => m && m !== MOTIF_COMMUNE)
  return reste.length ? reste.join(' · ') : null
}

/**
 * Arrêts lus sur UNE page → enrichis par le référentiel. `communePrecedente` = dernière commune
 * de la page d'avant (une page peut commencer sans bandeau).
 */
export function appliquerReferentiel<T extends ArretALire>(arrets: T[], ref: Referentiel, communePrecedente: string | null = null): Array<T & Enrichi> {
  let precedente = communePrecedente
  const communes = arrets.map(a => {
    const c = trouverCommune(ref, a.secteur) ?? trouverCommune(ref, a.commune) ?? (a.commune ? null : precedente) ?? a.commune
    if (c) precedente = c
    return c
  })
  // 1. Rue : nom officiel (accents, abréviations), puis nom approché (« carriers » → Carrières).
  const rues: Array<RueRef | null> = arrets.map((a, i) => {
    const c = communes[i]
    return c ? (trouverRue(ref, c, a.rue) ?? trouverRueProche(ref, c, a.rue)) : null
  })
  // 2. Rue encore inconnue : déduite de sa place sur la feuille (ordre habituel) et de ses numéros.
  for (let i = 0; i < arrets.length;) {
    const c = communes[i]
    if (rues[i] || !c || !arrets[i].rue) { i++; continue }
    let j = i
    while (j + 1 < arrets.length && !rues[j + 1] && communes[j + 1] === c && cle(arrets[j + 1].rue) === cle(arrets[i].rue)) j++
    let avant: number | null = null; let apres: number | null = null
    for (let k = i - 1; k >= 0; k--) if (rues[k] && communes[k] === c && rues[k]!.rang != null) { avant = rues[k]!.rang; break }
    for (let k = j + 1; k < arrets.length; k++) if (rues[k] && communes[k] === c && rues[k]!.rang != null) { apres = rues[k]!.rang; break }
    const numeros = arrets.slice(i, j + 1).map(a => a.numero)
    const r = trouverRueParPlace(ref, c, numeros, avant, apres)
    // Au moins la moitié des numéros lus doivent exister dans la rue retenue.
    if (r) {
      const lus = numeros.map(norm).filter(Boolean)
      if (lus.filter(x => r.numeros[x] != null).length * 2 >= lus.length) for (let k = i; k <= j; k++) rues[k] = r
    }
    i = j + 1
  }
  recalerParNumeros(arrets.map(a => a.numero ?? null), communes, rues)
  return arrets.map((a, i) => {
    const commune = communes[i]
    const r = rues[i]
    const numero = r ? corrigerNumero(r, a.numero) : (a.numero ?? null)
    const pos = r ? localiserNumero(r, numero) : null
    const type = a.type === 'c' && r && estRelais(r, numero) ? 'rc' : a.type
    const motif = commune && a.motif ? sansMotifCommune(a.motif) : (a.motif ?? null)
    return {
      ...a,
      numero,
      commune: r?.commune ?? commune,
      rue: r?.rue ?? a.rue,
      type,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      geo_precision: pos?.precision ?? null,
      rue_connue: !!r,
      ref_rang: r?.rang ?? null,
      ref_rang_commune: commune ? (ref.premierRang.get(cle(commune)) ?? null) : null,
      motif,
      a_verifier: a.a_verifier === undefined ? undefined : motif != null,
    }
  })
}
