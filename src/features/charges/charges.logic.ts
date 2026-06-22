import type { ChargeRow } from './charges.types'

export { formatCents } from '../../shared/lib/money'
export { categoryColor } from '../../shared/lib/categories.queries'

export function computeTtcCts(htCts: number, tvaRate: number): number {
  return htCts + Math.round((htCts * tvaRate) / 100)
}

export function kpiSummary(rows: ChargeRow[]) {
  const totalHtCts  = rows.reduce((s, r) => s + r.montant_ht_cts, 0)
  const totalTtcCts = rows.reduce((s, r) => s + (r.montant_ttc_cts ?? r.montant_ht_cts), 0)
  const byCategory  = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.charge_categories?.slug ?? 'autre'
    acc[key] = (acc[key] ?? 0) + r.montant_ht_cts
    return acc
  }, {})
  return { totalHtCts, totalTtcCts, nb: rows.length, byCategory }
}
