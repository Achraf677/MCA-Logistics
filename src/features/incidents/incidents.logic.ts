import type { IncidentRow, IncidentStatus, IncidentType } from './incidents.types'

export const TYPE_LABELS: Record<IncidentType, string> = {
  accident:    'Accident',
  panne:       'Panne',
  vol:         'Vol',
  vandalisme:  'Vandalisme',
  infraction:  'Infraction',
  autre:       'Autre',
}

export const TYPE_COLOR: Record<IncidentType, 'danger' | 'warning' | 'muted' | 'info'> = {
  accident:   'danger',
  panne:      'warning',
  vol:        'danger',
  vandalisme: 'danger',
  infraction: 'warning',
  autre:      'muted',
}

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  ouvert:   'Ouvert',
  en_cours: 'En cours',
  clos:     'Clos',
}

export const STATUS_COLOR: Record<IncidentStatus, 'danger' | 'warning' | 'success'> = {
  ouvert:   'danger',
  en_cours: 'warning',
  clos:     'success',
}

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function kpiSummary(rows: IncidentRow[]) {
  const ouverts  = rows.filter(r => r.status === 'ouvert').length
  const enCours  = rows.filter(r => r.status === 'en_cours').length
  const totalDmg = rows.reduce((s, r) => s + (r.damage_cts ?? 0), 0)
  return { nb: rows.length, ouverts, enCours, totalDmg }
}
