// Logique pure du Dashboard — aucune dépendance DB ni DOM.
//
// DATES EN HEURE LOCALE. L'ancien calcul faisait `new Date(a, m, 1).toISOString()` :
// minuit à Paris = 22 h ou 23 h la veille en UTC, donc le « mois d'octobre » allait
// du 30/09 au 30/10. Ici, une date se formate avec ses composantes LOCALES.

import { effectiveHtCts, effectiveTtcCts, type AmountSource } from '../../shared/lib/money'

/** Date → 'AAAA-MM-JJ' selon l'heure locale (pas UTC). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface Mois {
  /** 'AAAA-MM' */
  cle: string
  debut: string
  fin: string
  libelle: string
}

/** Le mois décalé de `decalage` par rapport à celui de `ref` (0 = mois de `ref`). */
export function mois(ref: Date, decalage = 0): Mois {
  const d = new Date(ref.getFullYear(), ref.getMonth() + decalage, 1)
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return {
    cle: isoLocal(d).slice(0, 7),
    debut: isoLocal(d),
    fin: isoLocal(fin),
    libelle: d.toLocaleDateString('fr-FR', { month: 'short' }),
  }
}

export type PeriodeTendance = '6m' | '12m' | 'ytd'

/** Mois affichés par la courbe, du plus ancien au plus récent. */
export function moisDeLaPeriode(periode: PeriodeTendance, ref: Date): Mois[] {
  const n = periode === '12m' ? 12 : periode === '6m' ? 6 : ref.getMonth() + 1
  return Array.from({ length: n }, (_, i) => mois(ref, i - (n - 1)))
}

export interface PointTendance {
  cle: string
  libelle: string
  debut: string
  fin: string
  caHtCts: number
  nb: number
  nbFacturee: number
}

type LigneLivraison = AmountSource & { date: string; statut: string }

/**
 * Regroupe les livraisons (hors annulées) par mois. Une seule requête pour
 * toute la période, au lieu de deux par mois.
 */
export function agregerParMois(liste: Mois[], livraisons: LigneLivraison[]): PointTendance[] {
  const points = new Map<string, PointTendance>(liste.map(m => [m.cle, {
    cle: m.cle, libelle: m.libelle, debut: m.debut, fin: m.fin, caHtCts: 0, nb: 0, nbFacturee: 0,
  }]))
  for (const l of livraisons) {
    if (l.statut === 'annulee') continue
    const p = points.get(l.date.slice(0, 7))
    if (!p) continue
    p.caHtCts += effectiveHtCts(l)
    p.nb += 1
    if (l.statut === 'facturee' || l.statut === 'payee') p.nbFacturee += 1
  }
  return [...points.values()]
}

/** « septembre 2026 » depuis 'AAAA-MM'. */
export function libelleMoisLong(cle: string): string {
  const [a, m] = cle.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

// ── Formats courts (pilotage : l'euro suffit, les centimes encombrent) ───────

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** 189459 → « 1 895 € ». */
export function eurosArrondis(cts: number): string {
  return EUROS.format(Math.round(cts / 100))
}

/** 189459 → « 1,9 k€ » ; 85000 → « 850 € ». Pour les étiquettes de barres. */
export function eurosCourts(cts: number): string {
  const eur = Math.round(cts / 100)
  if (Math.abs(eur) < 1000) return `${eur} €`
  return `${(eur / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '')} k€`
}

/** Évolution en % entre deux valeurs ; `null` si la base est nulle. */
export function evolution(avant: number, apres: number): { value: string; dir: 'up' | 'down' } | null {
  if (avant <= 0) return null
  const pct = ((apres - avant) / avant) * 100
  return { value: `${pct.toFixed(1).replace('.', ',')} %`, dir: apres >= avant ? 'up' : 'down' }
}

// ── Aujourd'hui ──────────────────────────────────────────────────────────────

export interface CourseDuJour {
  date: string
  statut: string
  arrival_time: string | null
  probleme_le: string | null
}

export interface ResumeJour {
  aFaire: number
  enCours: number
  livrees: number
  /** Courses encore ouvertes dont l'heure (ou le jour) est passé. */
  enRetard: number
  /** Échecs signalés par un chauffeur, course encore ouverte. */
  echecs: number
}

const OUVERTES = new Set(['planifiee', 'en_cours'])
const FAITES = new Set(['livree', 'facturee', 'payee'])

/**
 * Photo de la journée. `courses` = celles du jour + toutes les ouvertes des
 * jours passés (restées planifiées / en cours : elles sont en retard).
 * `maintenant` = heure locale en minutes depuis minuit.
 */
export function resumeJour(courses: CourseDuJour[], aujourdhui: string, maintenant: number): ResumeJour {
  const r: ResumeJour = { aFaire: 0, enCours: 0, livrees: 0, enRetard: 0, echecs: 0 }
  for (const c of courses) {
    const ouverte = OUVERTES.has(c.statut)
    if (ouverte && c.probleme_le) r.echecs += 1
    if (ouverte && estEnRetard(c, aujourdhui, maintenant)) r.enRetard += 1
    if (c.date !== aujourdhui) continue
    if (c.statut === 'planifiee') r.aFaire += 1
    else if (c.statut === 'en_cours') r.enCours += 1
    else if (FAITES.has(c.statut)) r.livrees += 1
  }
  return r
}

function estEnRetard(c: CourseDuJour, aujourdhui: string, maintenant: number): boolean {
  if (c.date < aujourdhui) return true
  if (c.date > aujourdhui || !c.arrival_time) return false
  const m = /^(\d{1,2}):(\d{2})/.exec(c.arrival_time)
  return !!m && Number(m[1]) * 60 + Number(m[2]) < maintenant
}

// ── Argent ───────────────────────────────────────────────────────────────────

export interface FactureOuverte extends AmountSource {
  invoiced_at: string | null
  payment_terms: number
}

/** Échéance = date de facture + délai de paiement du client (jours). */
export function echeance(invoicedAt: string, delaiJours: number): string {
  const [a, m, j] = invoicedAt.slice(0, 10).split('-').map(Number)
  return isoLocal(new Date(a, m - 1, j + delaiJours))
}

/** À encaisser (TTC) et, dedans, ce qui a dépassé son échéance. */
export function aEncaisser(factures: FactureOuverte[], aujourdhui: string) {
  let totalCts = 0, retardCts = 0, nbRetard = 0
  for (const f of factures) {
    const ttc = effectiveTtcCts(f)
    totalCts += ttc
    if (f.invoiced_at && echeance(f.invoiced_at, f.payment_terms) < aujourdhui) {
      retardCts += ttc
      nbRetard += 1
    }
  }
  return { totalCts, retardCts, nbRetard, nb: factures.length }
}

/** Reste à facturer : livrées pas encore facturées (HT). */
export function resteAFacturer(livrees: AmountSource[]) {
  return { totalCts: livrees.reduce((s, l) => s + effectiveHtCts(l), 0), nb: livrees.length }
}
