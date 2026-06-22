import type { PaymentMethod, PaymentRow } from './encaissement.types'

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  virement: 'Virement',
  cb:       'Carte bancaire',
  especes:  'Espèces',
  cheque:   'Chèque',
  autre:    'Autre',
}

export const METHOD_COLOR: Record<PaymentMethod, 'success' | 'info' | 'warning' | 'muted'> = {
  virement: 'success',
  cb:       'info',
  especes:  'warning',
  cheque:   'muted',
  autre:    'muted',
}

export { formatCents } from '../../shared/lib/money'

export function kpiSummary(rows: PaymentRow[]) {
  const totalCts = rows.reduce((s, r) => s + r.amount_cts, 0)
  const byMethod = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.method ?? 'autre'
    acc[k] = (acc[k] ?? 0) + r.amount_cts
    return acc
  }, {})
  return { nb: rows.length, totalCts, byMethod }
}
