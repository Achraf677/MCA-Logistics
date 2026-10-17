// Feuille de route de messagerie (Colissimo) — PUR, testé (feuilleRoute.test.ts).
//
// La vision lit le tableau « ADRESSES DE LIVRAISON » LIGNE PAR LIGNE, en recopiant la case
// « N° » telle qu'elle est imprimée (« 12, 14 (2), RC 3 »). Le découpage en arrêts (un arrêt
// par numéro) se fait ICI, en code : un modèle qui découpe lui-même invente plus facilement un
// numéro ou en saute un. On garde aussi « Nb Colis » de la ligne pour contrôler la somme : un
// écart = ligne mal alignée (photo de biais) → arrêts marqués « à vérifier ».
//
// Notation de la feuille :
//   - « N° » : numéros séparés par des virgules ;
//   - « (3) » après un numéro = 3 colis à ce numéro (sinon 1) ;
//   - préfixe « RC » = point relais ; « [C] » = collecte.
//   - « District » vide = même commune que la ligne du dessus.

export type TypeArret = 'c' | 'rc' | 'col'

/** Une ligne du tableau telle que la vision la renvoie (après nettoyage). */
export interface LigneFeuille {
  commune: string | null
  cp: string | null
  rue: string | null
  nb_colis: number | null
  numeros: string | null
  crbt: string | null
}

/** Un arrêt lu : un numéro d'une rue (ou la rue entière). */
export interface ArretFeuille {
  commune: string | null
  cp: string | null
  rue: string | null
  numero: string | null
  quantite: number
  type: TypeArret
  note: string | null
  /** Somme des colis de la ligne ≠ « Nb Colis » imprimé, ou case illisible. */
  a_verifier: boolean
}

export type EnteteFeuille = Record<string, string | number | null>

export interface LectureFeuille {
  entete: EnteteFeuille | null
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

const CLES_ENTETE = ['date', 'vehicule', 'circuit', 'tournee', 'nb_colis', 'nb_arrets', 'agence'] as const

/** Réponse brute de la vision → structure sûre (types vérifiés, longueurs bornées). */
export function nettoyerLecture(brut: unknown): LectureFeuille {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>
  let entete: EnteteFeuille | null = null
  if (b.entete && typeof b.entete === 'object') {
    const e = b.entete as Record<string, unknown>
    const propre: EnteteFeuille = {}
    for (const k of CLES_ENTETE) {
      const v = k === 'nb_colis' || k === 'nb_arrets' ? entier(e[k], 9999) : texte(e[k], 60)
      if (v != null) propre[k] = v
    }
    entete = Object.keys(propre).length ? propre : null
  }
  const lignes = (Array.isArray(b.lignes) ? b.lignes : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .slice(0, 300)
    .map(l => ({
      commune: texte(l.commune ?? l.district, 80),
      cp: texte(l.cp, 10),
      rue: texte(l.rue, 120),
      nb_colis: entier(l.nb_colis),
      numeros: texte(l.numeros ?? l.numero, 400),
      crbt: texte(l.crbt, 60),
    }))
  return { entete, lignes }
}

// ── Découpage de la case « N° » ─────────────────────────────────────────────

export interface NumeroLu {
  numero: string | null
  /** Quantité écrite « (n) » ; null = non précisée. */
  quantite: number | null
  type: TypeArret
}

/**
 * « 12, 14 (2), RC 3, [C] 7 » → 4 numéros. Case vide → un seul « numéro » null (la rue).
 * Un « RC » ou « [C] » seul (sans numéro) reste un arrêt sans numéro, de ce type.
 */
export function decouperNumeros(case_: string | null | undefined): NumeroLu[] {
  const brut = (case_ ?? '').trim()
  if (!brut) return [{ numero: null, quantite: null, type: 'c' }]
  const out: NumeroLu[] = []
  for (const morceau of brut.split(/[,;]/)) {
    let t = morceau.trim()
    if (!t) continue
    let type: TypeArret = 'c'
    if (/\[\s*c\s*\]/i.test(t)) { type = 'col'; t = t.replace(/\[\s*c\s*\]/gi, ' ') }
    if (/^\s*rc\b\.?/i.test(t)) { if (type === 'c') type = 'rc'; t = t.replace(/^\s*rc\b\.?/i, ' ') }
    let quantite: number | null = null
    const q = t.match(/\(\s*(\d{1,3})\s*\)/)
    if (q) { quantite = Math.max(1, Number(q[1])); t = t.replace(q[0], ' ') }
    const numero = t.replace(/\s+/g, ' ').trim()
      .replace(/^(\d+)\s*(bis|ter|quater)$/i, (_, n: string, s: string) => `${n} ${s.toLowerCase()}`)
    out.push({ numero: numero || null, quantite, type })
  }
  return out.length ? out : [{ numero: null, quantite: null, type: 'c' }]
}

// ── Commune / code postal ───────────────────────────────────────────────────

/** « 67540 OSTWALD », « OSTWALD (67540) » → { commune: 'OSTWALD', cp: '67540' }. */
export function separerCommune(commune: string | null, cp: string | null): { commune: string | null; cp: string | null } {
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

/**
 * Lignes du tableau (dans l'ordre de la feuille) → arrêts, un par numéro.
 * - commune / CP vides : repris de la ligne du dessus (cases fusionnées) ;
 * - un seul numéro sans « (n) » : il reçoit tous les colis de la ligne ;
 * - sinon chaque numéro vaut « (n) » ou 1 ;
 * - somme des colis livrés (domicile + relais) ≠ « Nb Colis » → « à vérifier » ;
 * - CRBT de la ligne : noté sur son premier arrêt.
 */
export function lignesEnArrets(lignes: LigneFeuille[]): ArretFeuille[] {
  const arrets: ArretFeuille[] = []
  let communePrec: string | null = null
  let cpPrec: string | null = null
  for (const l of lignes) {
    const sep = separerCommune(l.commune, l.cp)
    const commune: string | null = sep.commune ?? communePrec
    const cp: string | null = sep.commune ? sep.cp : (sep.cp ?? cpPrec)
    communePrec = commune; cpPrec = cp
    if (!l.rue && !l.numeros) continue
    const rueRelais = !!l.rue && /^\s*rc\b/i.test(l.rue)
    const numeros = decouperNumeros(l.numeros).map(n =>
      rueRelais && n.type === 'c' ? { ...n, type: 'rc' as TypeArret } : n)
    const unSeul = numeros.length === 1 && numeros[0].quantite == null
    const quantites = numeros.map(n =>
      unSeul && l.nb_colis != null && l.nb_colis >= 1 ? l.nb_colis : (n.quantite ?? 1))
    const somme = numeros.reduce((s, n, i) => s + (n.type === 'col' ? 0 : quantites[i]), 0)
    const ecart = l.nb_colis != null && l.nb_colis !== somme && numeros.some(n => n.type !== 'col')
    const illisible = !l.rue || !commune
    numeros.forEach((n, i) => {
      arrets.push({
        commune, cp, rue: l.rue, numero: n.numero, quantite: quantites[i], type: n.type,
        note: i === 0 && l.crbt ? `CRBT : ${l.crbt}` : null,
        a_verifier: ecart || illisible,
      })
    })
  }
  return arrets
}
