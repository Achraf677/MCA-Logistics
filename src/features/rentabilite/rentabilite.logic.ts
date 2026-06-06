// Logique pure de la Rentabilité — aucune dépendance DB ni DOM.
// Source des données brutes : getRentabiliteData (rentabilite.queries.ts).
// Le formatage (€, %) reste dans le composant : ici, uniquement des NOMBRES (centimes).

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface RawDelivery { date: string | null; montant_ht_cts: number | null }
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
    const caHt       = raw.deliveries.filter(d => monthOf(d.date) === m).reduce((s, d) => s + (d.montant_ht_cts ?? 0), 0)
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
