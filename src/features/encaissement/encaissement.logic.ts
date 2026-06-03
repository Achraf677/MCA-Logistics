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

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function kpiSummary(rows: PaymentRow[]) {
  const totalCts = rows.reduce((s, r) => s + r.amount_cts, 0)
  const byMethod = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.method ?? 'autre'
    acc[k] = (acc[k] ?? 0) + r.amount_cts
    return acc
  }, {})
  return { nb: rows.length, totalCts, byMethod }
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
