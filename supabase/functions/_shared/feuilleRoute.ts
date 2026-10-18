// Feuille de route de messagerie (Colissimo) — PUR, testé (feuilleRoute.test.ts).
//
// Mise en page réelle (validée sur des feuilles du 17/10/2026) :
//   - un BANDEAU en gras « 67170 KRIEGSHEIM » (CP + commune) ouvre un groupe de lignes ; il vaut
//     pour toutes les lignes jusqu'au bandeau suivant. La vision le renvoie dans
//     `commune_bandeau` sur la 1re ligne qui le suit seulement ; le code le reporte vers le bas ;
//   - la colonne « District » n'est PAS la commune : c'est le SECTEUR (« (HC) 610 - KRIEGSHEIM »),
//     répété sur chaque ligne du secteur ;
//   - colonnes lues par ligne : Rue | Nb Colis | Nb PGEO | N° | CRBT/taxes ;
//   - case « N° » recopiée telle quelle : numéros séparés par des virgules, « 5(2) » = 2 colis
//     au n° 5 (petits chiffres en exposant), « RC13(21) » = point relais, 21 colis,
//     « [C]11 » = COLLECTE (numéro en clair dans un carré noir), « ? » = chiffre illisible.
//
// Le découpage en arrêts (un par numéro) se fait ICI, en code : un modèle qui découpe lui-même
// invente plus facilement un numéro ou en saute un. Auto-contrôle par ligne : somme des colis
// = « Nb Colis » ET nombre de numéros = « Nb PGEO » ; sinon les arrêts de la ligne sont
// « à vérifier », avec le motif.

export type TypeArret = 'c' | 'rc' | 'col'

/** Une ligne du tableau telle que la vision la renvoie (après nettoyage). */
export interface LigneFeuille {
  /** Bandeau « 67170 KRIEGSHEIM » juste au-dessus de cette ligne, sinon null. */
  commune_bandeau: string | null
  /** Colonne District (« (HC) 610 - KRIEGSHEIM ») : secteur, pas commune. */
  secteur: string | null
  rue: string | null
  nb_colis: number | null
  nb_pgeo: number | null
  numeros: string | null
  crbt: string | null
}

/** Un arrêt lu : un numéro d'une rue (ou la rue entière). */
export interface ArretFeuille {
  commune: string | null
  cp: string | null
  secteur: string | null
  rue: string | null
  numero: string | null
  quantite: number
  type: TypeArret
  note: string | null
  a_verifier: boolean
  /** Pourquoi « à vérifier » (motifs séparés par « · »), sinon null. */
  motif: string | null
}

/** En-tête « Feuille de route » (cadre Colissimo), seulement s'il est sur la photo. */
export interface EnteteFeuille {
  date?: string
  societe?: string
  vehicule?: string
  imei?: string
  circuit?: string
  operateur?: string
  depart?: string
  remettant?: string
  /** Adresse du site remettant (agence, plateforme) si imprimée : départ par défaut de l'itinéraire. */
  adresse_remettant?: string
  livreur?: string
  nb_colis?: number
  nb_pgeo?: number
}

/** « x/y » en bas à droite de la page. */
export interface PageFeuille {
  numero: number
  total: number
}

export interface LectureFeuille {
  entete: EnteteFeuille | null
  page: PageFeuille | null
  lignes: LigneFeuille[]
}

// ── Nettoyage de la réponse du modèle ───────────────────────────────────────

function texte(v: unknown, max = 120): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

function entier(v: unknown, max = 999): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : Number(v)
  if (v == null || v === '' || !Number.isFinite(n) || n < 0 || n > max || !Number.isInteger(n)) return null
  return n
}

const CLES_TEXTE = ['date', 'societe', 'vehicule', 'imei', 'circuit', 'operateur', 'depart', 'remettant', 'adresse_remettant', 'livreur'] as const
const CLES_NOMBRE = ['nb_colis', 'nb_pgeo'] as const

/** « 2/3 », « 2 / 3 », « page 2/3 » → { numero: 2, total: 3 } ; incohérent → null. */
export function lirePage(v: unknown): PageFeuille | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = entier(o.numero, 99); const t = entier(o.total, 99)
    return n && t && n <= t ? { numero: n, total: t } : null
  }
  const m = typeof v === 'string' ? v.match(/(\d{1,2})\s*\/\s*(\d{1,2})/) : null
  if (!m) return null
  const numero = Number(m[1]); const total = Number(m[2])
  return numero >= 1 && numero <= total ? { numero, total } : null
}

/** Réponse brute de la vision → structure sûre (types vérifiés, longueurs bornées). */
export function nettoyerLecture(brut: unknown): LectureFeuille {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>
  let entete: EnteteFeuille | null = null
  if (b.entete && typeof b.entete === 'object') {
    const e = b.entete as Record<string, unknown>
    const propre: EnteteFeuille = {}
    for (const k of CLES_TEXTE) { const v = texte(e[k], 60); if (v != null) propre[k] = v }
    for (const k of CLES_NOMBRE) { const v = entier(e[k], 9999); if (v != null) propre[k] = v }
    entete = Object.keys(propre).length ? propre : null
  }
  const lignes = (Array.isArray(b.lignes) ? b.lignes : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .slice(0, 300)
    .map(l => ({
      commune_bandeau: texte(l.commune_bandeau, 80),
      secteur: texte(l.secteur, 80),
      rue: texte(l.rue, 120),
      nb_colis: entier(l.nb_colis),
      nb_pgeo: entier(l.nb_pgeo),
      numeros: texte(l.numeros, 400),
      crbt: texte(l.crbt, 60),
    }))
  return { entete, page: lirePage(b.page), lignes }
}

// ── Découpage de la case « N° » ─────────────────────────────────────────────

export interface NumeroLu {
  numero: string | null
  /** Quantité écrite « (n) » ; null = non précisée (= 1 colis). */
  quantite: number | null
  type: TypeArret
  /** Un « ? » dans le numéro : chiffre illisible. */
  illisible: boolean
}

/**
 * « 5(2), RC13(21), [C]11 » → 3 numéros. Case vide → un seul « numéro » null (la rue).
 * Un « RC » ou « [C] » seul (sans numéro) reste un arrêt sans numéro, de ce type.
 */
export function decouperNumeros(case_: string | null | undefined): NumeroLu[] {
  const brut = (case_ ?? '').trim()
  const rue: NumeroLu = { numero: null, quantite: null, type: 'c', illisible: false }
  if (!brut) return [rue]
  const out: NumeroLu[] = []
  for (const morceau of brut.split(/[,;]/)) {
    let t = morceau.trim()
    if (!t) continue
    let type: TypeArret = 'c'
    if (/\[\s*c\s*\]/i.test(t)) { type = 'col'; t = t.replace(/\[\s*c\s*\]/gi, ' ') }
    if (/^\s*rc(?=[\s\d.(?]|$)\.?/i.test(t)) { if (type === 'c') type = 'rc'; t = t.replace(/^\s*rc\.?/i, ' ') }
    let quantite: number | null = null
    const q = t.match(/\(\s*(\d{1,3})\s*\)/)
    if (q) { quantite = Math.max(1, Number(q[1])); t = t.replace(q[0], ' ') }
    const illisible = t.includes('?') || /\(\s*\?+\s*\)/.test(morceau)
    t = t.replace(/\(\s*\?*\s*\)/g, ' ')
    const numero = t.replace(/\s+/g, ' ').trim()
      .replace(/^(\d+)\s*(bis|ter|quater)$/i, (_, n: string, s: string) => `${n} ${s.toLowerCase()}`)
    out.push({ numero: numero || null, quantite, type, illisible })
  }
  return out.length ? out : [rue]
}

// ── Commune / code postal ───────────────────────────────────────────────────

/** « 67170 KRIEGSHEIM », « KRIEGSHEIM (67170) » → { commune: 'KRIEGSHEIM', cp: '67170' }. */
export function separerCommune(commune: string | null, cp: string | null = null): { commune: string | null; cp: string | null } {
  let c = commune ?? ''
  let code = (cp ?? '').match(/\d{5}/)?.[0] ?? null
  const dansCommune = c.match(/\b(\d{5})\b/)
  if (dansCommune) {
    code = code ?? dansCommune[1]
    c = c.replace(/\(?\s*\d{5}\s*\)?/, ' ')
  }
  c = c.replace(/[-–,]+\s*$/, '').replace(/^\s*[-–,]+/, '').replace(/\s+/g, ' ').trim()
  return { commune: c ? c.toUpperCase() : null, cp: code }
}

// ── Lignes → arrêts ─────────────────────────────────────────────────────────

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Auto-contrôle d'une ligne : motifs d'écart (vide = ligne cohérente). Pur. */
export function controlerLigne(l: Pick<LigneFeuille, 'nb_colis' | 'nb_pgeo' | 'numeros'>, numeros: NumeroLu[]): string[] {
  const motifs: string[] = []
  const vide = !(l.numeros ?? '').trim()
  if (numeros.some(n => n.illisible)) motifs.push('chiffre illisible')
  if (vide) return motifs
  const somme = numeros.reduce((s, n) => s + (n.quantite ?? 1), 0)
  if (l.nb_colis != null && somme !== l.nb_colis) {
    motifs.push(`${somme} colis lu${somme > 1 ? 's' : ''}, ${l.nb_colis} annoncé${l.nb_colis > 1 ? 's' : ''}`)
  }
  if (l.nb_pgeo != null && numeros.length !== l.nb_pgeo) {
    motifs.push(`${pluriel(numeros.length, 'numéro')} lu${numeros.length > 1 ? 's' : ''}, ${l.nb_pgeo} PGEO`)
  }
  return motifs
}

/**
 * Lignes du tableau (dans l'ordre de la feuille) → arrêts, un par numéro.
 * - commune / CP : ceux du dernier bandeau, reportés vers le bas jusqu'au suivant ;
 * - chaque numéro vaut « (n) » colis, sinon 1 ; case vide = la rue entière (Nb Colis) ;
 * - auto-contrôle Nb Colis / Nb PGEO (`controlerLigne`) → « à vérifier » + motif ;
 * - CRBT / taxes de la ligne : noté sur son premier arrêt.
 */
export function lignesEnArrets(lignes: LigneFeuille[]): ArretFeuille[] {
  const arrets: ArretFeuille[] = []
  let commune: string | null = null
  let cp: string | null = null
  for (const l of lignes) {
    if (l.commune_bandeau) {
      const sep = separerCommune(l.commune_bandeau)
      commune = sep.commune; cp = sep.cp
    }
    if (!l.rue && !l.numeros) continue
    const numeros = decouperNumeros(l.numeros)
    const vide = !(l.numeros ?? '').trim()
    const motifs = controlerLigne(l, numeros)
    if (!l.rue) motifs.push('rue illisible')
    if (!commune) motifs.push('commune absente (bandeau non lu)')
    const motif = motifs.length ? motifs.join(' · ') : null
    numeros.forEach((n, i) => {
      arrets.push({
        commune, cp, secteur: l.secteur, rue: l.rue, numero: n.numero,
        quantite: vide ? Math.max(1, l.nb_colis ?? 1) : (n.quantite ?? 1), type: n.type,
        note: i === 0 && l.crbt ? `CRBT : ${l.crbt}` : null,
        a_verifier: motif != null, motif,
      })
    })
  }
  return arrets
}
