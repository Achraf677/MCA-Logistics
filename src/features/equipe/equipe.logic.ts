import type { TeamMember } from './equipe.types'

export const CONTRACT_LABELS: Record<NonNullable<TeamMember['contract_type']>, string> = {
  cdi:     'CDI',
  cdd:     'CDD',
  interim: 'Intérim',
  associe: 'Associé',
}

export function getContractLabel(ct: TeamMember['contract_type']): string {
  return ct ? CONTRACT_LABELS[ct] : '—'
}

export function formatSalaryMonthly(cts: number | null): string {
  if (!cts) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cts / 100)
}

export function formatSalaryAnnual(cts: number | null): string {
  if (!cts) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((cts * 12) / 100)
}

export function getMasseSalariale(members: TeamMember[]): number {
  return members
    .filter(m => m.active && (m.contract_type === 'cdi' || m.contract_type === 'cdd'))
    .reduce((sum, m) => sum + (m.salary_gross_cts ?? 0), 0)
}
