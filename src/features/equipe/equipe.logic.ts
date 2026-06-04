import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import type { TeamMember } from './equipe.types'

export const ROLE_LABELS: Record<NonNullable<TeamMember['role']>, string> = {
  president: 'Président',
  dg:        'Directeur général',
  chauffeur: 'Chauffeur',
  comptable: 'Comptable',
}

export const CONTRACT_LABELS: Record<NonNullable<TeamMember['contract_type']>, string> = {
  cdi:     'CDI',
  cdd:     'CDD',
  interim: 'Intérim',
  associe: 'Associé',
}

export function getRoleLabel(role: TeamMember['role']): string {
  return role ? ROLE_LABELS[role] : '—'
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

// ── Validités ────────────────────────────────────────────────────────────────

export interface MemberEcheance {
  label: string
  date: string | null
  daysLeft: number | null
  status: EcheanceStatus
}

export function memberEcheances(member: TeamMember, today = new Date()): MemberEcheance[] {
  const entries: Array<{ label: string; date: string | null }> = [
    { label: 'Permis B',         date: member.licence_b_expiry },
    { label: 'Visite médicale',  date: member.medical_visit_expiry },
  ]
  return entries.map(({ label, date }) => {
    const { daysLeft, status } = computeEcheance(date, today)
    return { label, date, daysLeft, status }
  })
}

/** 'a_regulariser' seulement si au moins une validité est 'overdue'. 'none' n'impacte pas l'aptitude. */
export function aptitude(member: TeamMember, today = new Date()): 'apte' | 'a_regulariser' {
  const echeances = memberEcheances(member, today)
  return echeances.some(e => e.status === 'overdue') ? 'a_regulariser' : 'apte'
}

export function isDriverRole(role: TeamMember['role']): boolean {
  return role === 'chauffeur'
}

// ── Masse salariale ──────────────────────────────────────────────────────────

export function masseSalariale(members: TeamMember[]): number {
  return members
    .filter(m => m.active && (m.contract_type === 'cdi' || m.contract_type === 'cdd'))
    .reduce((sum, m) => sum + (m.salary_gross_cts ?? 0), 0)
}

/** @deprecated use masseSalariale */
export const getMasseSalariale = masseSalariale
