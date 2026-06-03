import type { MaintenanceRow, MaintenanceType } from './entretiens.types'

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  vidange:            'Vidange',
  pneus:              'Pneus',
  freins:             'Freins',
  controle_technique: 'Contrôle technique',
  revision:           'Révision',
  reparation:         'Réparation',
  inspection:         'Inspection',
  autre:              'Autre',
}

export const MAINTENANCE_TYPE_COLOR: Record<MaintenanceType, 'muted' | 'info' | 'warning' | 'danger' | 'success'> = {
  vidange:            'info',
  pneus:              'warning',
  freins:             'danger',
  controle_technique: 'warning',
  revision:           'info',
  reparation:         'danger',
  inspection:         'muted',
  autre:              'muted',
}

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function formatMileage(km: number): string {
  return km.toLocaleString('fr-FR') + ' km'
}

export function kpiSummary(rows: MaintenanceRow[]) {
  const totalCostCts = rows.reduce((s, r) => s + (r.cost_cts ?? 0), 0)
  const withNextDue = rows.filter(r => r.next_due_date != null)
  const overdue = withNextDue.filter(r => r.next_due_date! < new Date().toISOString().slice(0, 10))
  return { nb: rows.length, totalCostCts, withNextDue: withNextDue.length, overdue: overdue.length }
}
