import type { InspectionRow, InspectionStatus, InspectionType } from './inspections.types'

export const TYPE_LABELS: Record<InspectionType, string> = {
  pre_trajet:  'Pré-trajet',
  post_trajet: 'Post-trajet',
  periodique:  'Périodique',
}

export const STATUS_LABELS: Record<InspectionStatus, string> = {
  ok:      'Conforme',
  defauts: 'Défauts',
  refuse:  'Refusé',
}

export const STATUS_COLOR: Record<InspectionStatus, 'success' | 'warning' | 'danger'> = {
  ok:      'success',
  defauts: 'warning',
  refuse:  'danger',
}

export const CHECKLIST_LABELS: Record<string, string> = {
  exterior_ok:    'Carrosserie / extérieur',
  lights_ok:      'Éclairages',
  tires_ok:       'Pneus',
  brakes_ok:      'Freins',
  fluids_ok:      'Niveaux (huile, eau…)',
  docs_ok:        'Documents bord (carte grise, assurance…)',
  cleanliness_ok: 'Propreté intérieure',
}

export function computeStatus(form: Record<string, boolean>): 'ok' | 'defauts' {
  return Object.values(form).every(Boolean) ? 'ok' : 'defauts'
}

export function countDefects(row: InspectionRow): number {
  return [
    row.exterior_ok, row.lights_ok, row.tires_ok,
    row.brakes_ok, row.fluids_ok, row.docs_ok, row.cleanliness_ok,
  ].filter(v => !v).length
}

export function kpiSummary(rows: InspectionRow[]) {
  const ok      = rows.filter(r => r.status === 'ok').length
  const defauts = rows.filter(r => r.status === 'defauts').length
  const refuses = rows.filter(r => r.status === 'refuse').length
  return { nb: rows.length, ok, defauts, refuses }
}
