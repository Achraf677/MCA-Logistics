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

// ── Accès au site d'un salarié (lot S0, plan PLAN-ESPACE-SALARIE) ──────────────

export type ModeAcces = 'mot_de_passe' | 'invitation'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ce qui manque pour créer l'accès ; null si tout est bon. */
export function erreurAcces(p: { email: string; mode: ModeAcces; motDePasse: string }): string | null {
  if (!EMAIL.test(p.email.trim())) return 'E-mail invalide.'
  if (p.mode === 'mot_de_passe' && p.motDePasse.length < 8) return 'Mot de passe : 8 caractères minimum.'
  return null
}

const ERREURS_ACCES: Record<string, string> = {
  fiche_deja_reliee: 'Cette fiche est déjà reliée à un compte.',
  fiche_introuvable: 'Fiche introuvable.',
  compte_deja_relie: 'Ce compte est déjà relié à une autre fiche.',
  create_failed: 'Création refusée (e-mail déjà utilisé ?).',
  invite_failed: "Invitation non envoyée (e-mail du serveur non configuré) : choisis « Mot de passe ».",
  forbidden_president_only: 'Réservé au président.',
  link_failed: 'Compte créé mais pas relié à la fiche : réessaie « C’est mon compte » ou contacte le support.',
}

/** Message lisible d'un code d'erreur de l'Edge admin-users. */
export function libelleErreurAcces(code: string | null | undefined, detail?: string | null): string {
  if (code && ERREURS_ACCES[code]) return ERREURS_ACCES[code]
  return detail || code || 'Erreur inconnue.'
}
