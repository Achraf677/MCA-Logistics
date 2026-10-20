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
}

export function indexer(rues: RueRef[]): Referentiel {
  const noms = new Map<string, string>()
  const exact = new Map<string, RueRef>()
  const souple = new Map<string, RueRef>()
  const premierRang = new Map<string, number>()
  for (const r of rues) {
    if (!noms.has(r.commune_cle)) noms.set(r.commune_cle, r.commune)
    const k = `${r.commune_cle}|${r.rue_cle}`
    if (!exact.has(k)) exact.set(k, r)
    const ks = `${r.commune_cle}|${r.rue_souple}`
    if (!souple.has(ks)) souple.set(ks, r)
    if (r.rang != null) premierRang.set(r.commune_cle, Math.min(premierRang.get(r.commune_cle) ?? Infinity, r.rang))
  }
  const communes = [...noms.entries()].map(([c, nom]) => ({ cle: c, colle: colle(nom), nom }))
    .sort((a, b) => b.colle.length - a.colle.length)
  return { communes, exact, souple, premierRang }
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
  return arrets.map(a => {
    const commune = trouverCommune(ref, a.secteur) ?? trouverCommune(ref, a.commune) ?? (a.commune ? null : precedente) ?? a.commune
    if (commune) precedente = commune
    const r = commune ? trouverRue(ref, commune, a.rue) : null
    const pos = r ? localiserNumero(r, a.numero) : null
    const type = a.type === 'c' && r && estRelais(r, a.numero) ? 'rc' : a.type
    const motif = commune && a.motif ? sansMotifCommune(a.motif) : (a.motif ?? null)
    return {
      ...a,
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
