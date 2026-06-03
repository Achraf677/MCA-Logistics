import type { FuelLogRow, FuelType } from './carburant.types'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  diesel:   'Diesel',
  essence:  'Essence',
  electric: 'Électrique',
  hybrid:   'Hybride',
  lpg:      'GPL',
}

export const FUEL_TYPE_COLOR: Record<FuelType, 'muted' | 'info' | 'success' | 'warning'> = {
  diesel:   'muted',
  essence:  'warning',
  electric: 'success',
  hybrid:   'info',
  lpg:      'warning',
}

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function formatLiters(liters: number): string {
  return liters.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' L'
}

export function formatPricePerLiter(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }) + ' €/L'
}

export function kpiSummary(rows: FuelLogRow[]) {
  const totalCts = rows.reduce((s, r) => s + r.total_cts, 0)
  const totalLiters = rows.reduce((s, r) => s + r.liters, 0)
  const avgPricePerLiter = totalLiters > 0
    ? rows.reduce((s, r) => s + r.price_per_liter_cts * r.liters, 0) / totalLiters
    : 0
  return { totalCts, totalLiters, avgPricePerLiter, nb: rows.length }
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
