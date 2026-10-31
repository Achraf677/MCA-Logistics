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
//     « [C]11 » = COLLECTE (numéro en clair dans un carré noir), « ? » = chiffre illisible ;
//   - en plus, la vision liste à part les numéros vus en carré noir (`collectes`) : un numéro
//     listé là est une collecte même si le « [C] » a été oublié dans la case.
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
  /** Numéros vus en carré noir (collectes), listés à part par la vision. */
  collectes: string[]
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

/** Numéros listés par la vision (tableau ou texte « 10, 28A ») → liste propre. */
function listeNumeros(v: unknown): string[] {
  const brut = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : []
  return brut.map(x => texte(x, 12)).filter((x): x is string => !!x).slice(0, 40)
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
      collectes: listeNumeros(l.collectes),
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
 * Façons dont la vision écrit une collecte : « [C]11 », « (C)11 », « [COL]11 », « C]11 » ou « [C11 » (crochet perdu),
 * « COL 11 », ou le carré noir recopié tel quel (■ ▪ █…). Une lettre C collée derrière un numéro (« 12C ») n'en est pas une.
 */
const MARQUE = '\\[\\s*c(?:ol(?:lecte)?)?\\s*\\]|\\(\\s*c\\s*\\)|\\{\\s*c\\s*\\}|[■▪◼◾█▮⬛]|\\bc\\s*\\](?=\\s*\\d)|\\[\\s*c(?=\\s*\\d)|^\\s*col(?:lecte)?\\.?\\s*(?=\\d)'
const MARQUE_COLLECTE = new RegExp(MARQUE, 'i')
const MARQUE_COLLECTE_G = new RegExp(MARQUE, 'gi')

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
    if (MARQUE_COLLECTE.test(t)) { type = 'col'; t = t.replace(MARQUE_COLLECTE_G, ' ') }
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

const normNumero = (n: string | null | undefined) => (n ?? '').toUpperCase().replace(/\s+/g, '')

/** Un numéro listé dans `collectes` est une collecte, même si son « [C] » manque dans la case N°. Pur (modifie `numeros`). */
export function marquerCollectes(numeros: NumeroLu[], collectes: string[] | undefined): void {
  const liste = new Set((collectes ?? []).map(c => normNumero(decouperNumeros(c)[0]?.numero ?? c)).filter(Boolean))
  if (!liste.size) return
  for (const n of numeros) if (n.type === 'c' && n.numero && liste.has(normNumero(n.numero))) n.type = 'col'
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
 * Les petits chiffres en exposant « 5(2) » se lisent mal sur une photo, alors que les colonnes
 * Nb Colis / Nb PGEO sont imprimées en gros. Quand le nombre de numéros lus égale Nb PGEO (donc
 * aucun numéro n'est perdu) et que seule la somme des colis diffère, on s'appuie sur Nb Colis :
 * un seul numéro = tous les colis de la ligne ; sinon le seul numéro dont l'exposant a été lu
 * absorbe l'écart. Sinon (ambigu) on ne touche à rien : la ligne reste « à vérifier ».
 */
export function corrigerQuantites(l: Pick<LigneFeuille, 'nb_colis' | 'nb_pgeo'>, numeros: NumeroLu[]): void {
  if (l.nb_colis == null || numeros.some(n => n.illisible)) return
  if (l.nb_pgeo != null && numeros.length !== l.nb_pgeo) return
  const somme = numeros.reduce((s, n) => s + (n.quantite ?? 1), 0)
  const ecart = l.nb_colis - somme
  if (ecart === 0) return
  if (numeros.length === 1) { numeros[0].quantite = Math.max(1, l.nb_colis); return }
  const lus = numeros.filter(n => n.quantite != null)
  if (lus.length === 1 && (lus[0].quantite as number) + ecart >= 1) lus[0].quantite = (lus[0].quantite as number) + ecart
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
      commune = sep.commune; cp = sep.cp ?? cpDeCommune(sep.commune)
    }
    if (!l.rue && !l.numeros) continue
    const numeros = decouperNumeros(l.numeros)
    const vide = !(l.numeros ?? '').trim()
    marquerCollectes(numeros, l.collectes)
    if (!vide) corrigerQuantites(l, numeros)
    // Moins de numéros ET moins de colis que la feuille n'en annonce : des numéros n'ont pas été
    // lus. On ajoute d'office une ligne « n° illisible » avec les colis manquants (le livreur
    // regarde l'étiquette sur place) au lieu de bloquer la ligne entière.
    const somme = numeros.reduce((s, n) => s + (n.quantite ?? 1), 0)
    const manque = !vide && l.nb_colis != null && l.nb_pgeo != null && somme < l.nb_colis && numeros.length < l.nb_pgeo
      ? l.nb_colis - somme : 0
    const motifs = manque ? numeros.some(n => n.illisible) ? ['chiffre illisible'] : [] : controlerLigne(l, numeros)
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
    if (manque) {
      arrets.push({
        commune, cp, secteur: l.secteur, rue: l.rue, numero: null, quantite: manque, type: 'c',
        note: 'N° illisible sur la feuille : regarde l’étiquette', a_verifier: true,
        motif: `${pluriel(manque, 'colis')} sans numéro lisible (${l.nb_colis} colis / ${l.nb_pgeo} PGEO annoncés)`,
      })
    }
  }
  return arrets
}

// ── Secteurs « ZONE n » de Brumath, codes postaux ───────────────────────────

/**
 * Code postal des communes de la tournée (bandeau absent ou non lu : page sans bandeau, page
 * suivante). Seulement les communes dont le code est connu avec certitude (feuilles réelles).
 */
const CP_COMMUNE: Record<string, string> = {
  BRUMATH: '67170', KRIEGSHEIM: '67170', WINGERSHEIM: '67170', 'OHLUNGEN': '67590',
}

export function cpDeCommune(commune: string | null | undefined): string | null {
  const c = (commune ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
  for (const [nom, cp] of Object.entries(CP_COMMUNE)) if (c === nom || c.startsWith(nom + ' ')) return cp
  return null
}

/** Secteur de la tournée de Brumath : « 630 - ZONE 1 (Brumath) », « 634 - ZONE 5 » (zones 630 à 636). */
export function estSecteurBrumath(secteur: string | null | undefined): boolean {
  return /\bzone\s*\d/i.test(secteur ?? '') || /\b63\d\s*-\s*zone\b/i.test(secteur ?? '')
}

/**
 * Tournée de Brumath : TOUT est à Brumath (67170). Les cellules de zone sont fusionnées sur
 * plusieurs lignes, le bandeau n'est présent qu'en haut de la 1re page, et la vision confond
 * parfois zone / bandeau / commune. Toute ligne dont le secteur est une « ZONE n » est donc
 * rattachée à « 67170 BRUMATH » (bandeau absent, mal lu ou d'une autre commune). Les autres
 * lignes gardent le report normal du dernier bandeau. Pur : renvoie de nouvelles lignes.
 */
export function forcerBrumath(lignes: LigneFeuille[]): LigneFeuille[] {
  let commune: string | null = null
  return lignes.map(l => {
    let bandeau = l.commune_bandeau
    if (bandeau) commune = separerCommune(bandeau).commune
    if (estSecteurBrumath(l.secteur) && commune !== 'BRUMATH') {
      bandeau = '67170 BRUMATH'
      commune = 'BRUMATH'
    }
    return bandeau === l.commune_bandeau ? l : { ...l, commune_bandeau: bandeau }
  })
}
