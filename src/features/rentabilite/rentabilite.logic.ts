// Logique pure de la Rentabilité — aucune dépendance DB ni DOM.
// Source des données brutes : getRentabiliteData (rentabilite.queries.ts).
// Le formatage (€, %) reste dans le composant : ici, uniquement des NOMBRES (centimes).

import { effectiveHtCts } from '../../shared/lib/money'

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface RawDelivery { date: string | null; amount_ht_cts?: number | null; montant_ht_cts?: number | null }
export interface RawCharge   { date: string | null; montant_ht_cts: number | null }
export interface RawFuel     { date: string | null; total_cts: number | null }
export interface RawMaintenance { date: string | null; cost_cts: number | null }

export interface RentabiliteRaw {
  deliveries: RawDelivery[]
  charges: RawCharge[]
  fuel: RawFuel[]
  maintenances: RawMaintenance[]
  year: number
}

export interface MonthRow {
  mois: number        // index 0 (Janvier) … 11 (Décembre)
  caHt: number
  charges: number
  carburant: number
  entretiens: number
  resultat: number    // caHt − charges − carburant − entretiens (centimes)
}

export interface RentabiliteTotals {
  caHt: number
  charges: number
  carburant: number
  entretiens: number
  resultat: number
}

// ── Agrégation mensuelle ────────────────────────────────────────────────────────

/** Mois (0-11) d'une date brute, selon le fuseau local — identique au calcul inline d'origine. */
function monthOf(date: string | null): number {
  return new Date(date as string).getMonth()
}

/**
 * Construit les 12 lignes mensuelles (Janvier=0 … Décembre=11).
 * resultat = caHt − charges − carburant − entretiens (en centimes).
 */
export function monthlyRows(raw: RentabiliteRaw): MonthRow[] {
  return Array.from({ length: 12 }, (_, m): MonthRow => {
    const caHt       = raw.deliveries.filter(d => monthOf(d.date) === m).reduce((s, d) => s + effectiveHtCts(d), 0)
    const charges    = raw.charges.filter(d => monthOf(d.date) === m).reduce((s, d) => s + (d.montant_ht_cts ?? 0), 0)
    const carburant  = raw.fuel.filter(d => monthOf(d.date) === m).reduce((s, d) => s + (d.total_cts ?? 0), 0)
    const entretiens = raw.maintenances.filter(d => monthOf(d.date) === m).reduce((s, d) => s + (d.cost_cts ?? 0), 0)
    return { mois: m, caHt, charges, carburant, entretiens, resultat: caHt - charges - carburant - entretiens }
  })
}

// ── Totaux annuels ──────────────────────────────────────────────────────────────

/** Somme des 12 lignes mensuelles, champ par champ. */
export function annualTotals(rows: MonthRow[]): RentabiliteTotals {
  return rows.reduce<RentabiliteTotals>(
    (acc, r) => ({
      caHt: acc.caHt + r.caHt,
      charges: acc.charges + r.charges,
      carburant: acc.carburant + r.carburant,
      entretiens: acc.entretiens + r.entretiens,
      resultat: acc.resultat + r.resultat,
    }),
    { caHt: 0, charges: 0, carburant: 0, entretiens: 0, resultat: 0 },
  )
}

// ── Taux de marge ────────────────────────────────────────────────────────────────

/**
 * Taux de marge = resultat / caHt (ratio brut, sans formatage).
 * Cas limite caHt = 0 → `null` (non défini), jamais NaN/Infinity.
 * Le composant formate null → « — » (comportement iso à l'ancien `pct`).
 */
export function margeRatio(totals: Pick<RentabiliteTotals, 'caHt' | 'resultat'>): number | null {
  if (totals.caHt === 0) return null
  return totals.resultat / totals.caHt
}

// ── Coûts unitaires partagés (Calculateur ↔ Simulateur course) ──────────────────

export type CalcFreq = 'mensuel' | 'parJour' | 'auKm'

export interface CalcLineItem {
  freq: CalcFreq
  montant: number | string
}

export interface CalcParams {
  jours:     number | string
  gazoleTTC: number | string
  tvaRecup:  number | string
  conso:     number | string
  kmJour:    number | string
}

export interface CoutsUnitaires {
  coutLitreHT:     number  // €/L HT réel (après TVA récupérable)
  coutCarburantKm: number  // €/km carburant
  coutUsureKm:     number  // €/km hors carburant (dépenses auKm : entretien, pneus…)
  coutTempsHeure:  number  // €/h (charges mensuel + parJour ramenées à l'heure, base 8 h/j)
  heuresParJour:   number  // constante utilisée (8)
}

/** Valeurs par défaut MCA — synchronisées avec les défauts du Calculateur. */
export const DEFAULT_CALC_PARAMS: CalcParams = {
  jours: 21, gazoleTTC: 2.05, tvaRecup: 100, conso: 10, kmJour: 450,
}

export const DEFAULT_CALC_DEPENSES: CalcLineItem[] = [
  { freq: 'mensuel', montant: 2000  },  // Salaire chargé
  { freq: 'parJour', montant: 7.2   },  // Tickets resto
  { freq: 'mensuel', montant: 300   },  // Assurance véhicule
  { freq: 'mensuel', montant: 79    },  // Pennylane
  { freq: 'mensuel', montant: 18    },  // Claude
  { freq: 'mensuel', montant: 6.75  },  // Google Workspace
  { freq: 'mensuel', montant: 500   },  // Leasing / amortissement
  { freq: 'auKm',    montant: 0.04  },  // Entretien, pneus, vidanges
]

const HEURES_PAR_JOUR = 8

function toNum(v: number | string): number {
  return v === '' || v == null ? 0 : Number(v)
}

/**
 * Dérive les coûts unitaires à partir des hypothèses du Calculateur.
 * Fonction pure — aucun effet de bord.
 *
 * coutTempsHeure = (charges mensuel + parJour×jours) / (jours × 8 h) :
 * toutes les charges à base temporelle (salaire, assurance, leasing, SaaS…).
 */
export function deriveCoutsUnitaires(
  params: CalcParams,
  depenses: CalcLineItem[],
): CoutsUnitaires {
  const jours    = toNum(params.jours)
  const ttc      = toNum(params.gazoleTTC)
  const htBase   = ttc / 1.2
  const tva      = ttc - htBase
  const coutLitreHT     = htBase + tva * (1 - toNum(params.tvaRecup) / 100)
  const coutCarburantKm = (toNum(params.conso) / 100) * coutLitreHT

  const coutUsureKm = depenses
    .filter(x => x.freq === 'auKm')
    .reduce((s, x) => s + toNum(x.montant), 0)

  const chargesMensuelles = depenses
    .filter(x => x.freq === 'mensuel')
    .reduce((s, x) => s + toNum(x.montant), 0)
  const chargesParJour = depenses
    .filter(x => x.freq === 'parJour')
    .reduce((s, x) => s + toNum(x.montant) * jours, 0)
  const coutTempsHeure = jours > 0
    ? (chargesMensuelles + chargesParJour) / (jours * HEURES_PAR_JOUR)
    : 0

  return { coutLitreHT, coutCarburantKm, coutUsureKm, coutTempsHeure, heuresParJour: HEURES_PAR_JOUR }
}

// ── Simulation d'une course ───────────────────────────────────────────────────────

export interface CourseInput {
  prixPropose:    number   // € HT
  distanceCharge: number   // km en charge
  dureeH:         number   // durée de livraison (h)
  kilometresVide: number   // trajet à vide (h/r) — défaut 0
  peages:         number   // € — défaut 0
  attenteH:       number   // attente chargement/déchargement (h) — défaut 0
  nbPoints:       number   // informatif — défaut 1
  margeCible:     number   // ratio, ex. 0.20 pour 20 %
}

export type CourseVerdict = 'rentable' | 'limite' | 'refuser'

export interface CourseResult {
  kmTotal:       number
  heuresTotales: number
  coutCarburant: number
  coutUsure:     number
  coutTemps:     number
  coutPeages:    number
  coutTotal:     number
  margeNette:    number
  margePct:      number         // ratio margeNette/prixPropose (peut être négatif)
  prixPlancher:  number         // = coutTotal
  prixCible:     number         // = coutTotal × (1 + margeCible)
  prixH:         number         // prixPropose / heuresTotales
  margeH:        number         // margeNette / heuresTotales
  prixKm:        number
  margeKm:       number
  verdict:       CourseVerdict
}

/**
 * Calcule le résultat d'une course à partir des entrées et des coûts unitaires.
 * Verdict : rentable (marge% ≥ cible) · limite (0 ≤ marge% < cible) · refuser (< 0).
 */
export function simulateCourse(input: CourseInput, couts: CoutsUnitaires): CourseResult {
  const kmTotal       = input.distanceCharge + input.kilometresVide
  const heuresTotales = input.dureeH + input.attenteH

  const coutCarburant = kmTotal * couts.coutCarburantKm
  const coutUsure     = kmTotal * couts.coutUsureKm
  const coutTemps     = heuresTotales * couts.coutTempsHeure
  const coutPeages    = input.peages
  const coutTotal     = coutCarburant + coutUsure + coutTemps + coutPeages

  const margeNette = input.prixPropose - coutTotal
  const margePct   = input.prixPropose > 0 ? margeNette / input.prixPropose : (margeNette >= 0 ? 0 : -1)

  const prixPlancher = coutTotal
  const prixCible    = coutTotal * (1 + input.margeCible)

  const prixH   = heuresTotales > 0 ? input.prixPropose / heuresTotales : 0
  const margeH  = heuresTotales > 0 ? margeNette / heuresTotales : 0
  const prixKm  = kmTotal > 0 ? input.prixPropose / kmTotal : 0
  const margeKm = kmTotal > 0 ? margeNette / kmTotal : 0

  let verdict: CourseVerdict
  if (margeNette < 0)                 verdict = 'refuser'
  else if (margePct < input.margeCible) verdict = 'limite'
  else                                 verdict = 'rentable'

  return {
    kmTotal, heuresTotales, coutCarburant, coutUsure, coutTemps, coutPeages, coutTotal,
    margeNette, margePct, prixPlancher, prixCible, prixH, margeH, prixKm, margeKm, verdict,
  }
}
