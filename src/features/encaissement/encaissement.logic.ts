import type { EncaissementRow } from './encaissement.types'

export { formatCents } from '../../shared/lib/money'

export function kpiSummary(rows: EncaissementRow[]) {
  const totalEncaisseCts = rows.reduce((s, r) => s + r.effective_ttc_cts, 0)
  return { nb: rows.length, totalEncaisseCts }
}
