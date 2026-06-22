import type { ChargeCategory, ChargeRow } from './charges.types'

/** Source unique — utilisée par le filtre, le dropdown inline et le drawer. */
export const CHARGE_CATEGORIES: ChargeCategory[] = [
  'carburant', 'assurance', 'entretien', 'salaire',
  'logiciel', 'telecom', 'loyer', 'frais_bancaires',
  'comptabilite', 'publicite', 'autre',
]

export const CATEGORY_LABELS: Record<ChargeCategory, string> = {
  carburant:      'Carburant',
  assurance:      'Assurance',
  entretien:      'Entretien',
  salaire:        'Salaire',
  logiciel:       'Logiciel',
  telecom:        'Télécom',
  loyer:          'Loyer',
  frais_bancaires:'Frais bancaires',
  comptabilite:   'Comptabilité',
  publicite:      'Publicité',
  autre:          'Autre',
}

export const CATEGORY_COLOR: Record<ChargeCategory, 'muted' | 'info' | 'warning' | 'danger' | 'success'> = {
  carburant:       'warning',
  assurance:       'info',
  entretien:       'warning',
  salaire:         'danger',
  logiciel:        'muted',
  telecom:         'muted',
  loyer:           'muted',
  frais_bancaires: 'muted',
  comptabilite:    'muted',
  publicite:       'muted',
  autre:           'muted',
}

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function computeTtcCts(htCts: number, tvaRate: number): number {
  return htCts + Math.round((htCts * tvaRate) / 100)
}

export function kpiSummary(rows: ChargeRow[]) {
  const totalHtCts = rows.reduce((s, r) => s + r.montant_ht_cts, 0)
  const totalTtcCts = rows.reduce((s, r) => s + (r.montant_ttc_cts ?? r.montant_ht_cts), 0)
  const byCategory = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.category ?? 'autre'
    acc[key] = (acc[key] ?? 0) + r.montant_ht_cts
    return acc
  }, {})
  return { totalHtCts, totalTtcCts, nb: rows.length, byCategory }
}
