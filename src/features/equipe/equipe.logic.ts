import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
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
    { label: 'Prochaine visite médicale', date: member.medical_visit_expiry },
  ]
  return entries.map(({ label, date }) => {
    const { daysLeft, status } = computeEcheance(date, today)
    return { label, date, daysLeft, status }
  })
}

export type Aptitude = 'apte' | 'a_completer' | 'a_regulariser'

/**
 * 'a_regulariser' si une validité est dépassée ; 'a_completer' si une date
 * manque (on ne peut pas dire « Apte » sans permis ni visite connus) ; sinon 'apte'.
 */
export function aptitude(member: TeamMember, today = new Date()): Aptitude {
  const echeances = memberEcheances(member, today)
  if (echeances.some(e => e.status === 'overdue')) return 'a_regulariser'
  if (echeances.some(e => e.status === 'none'))    return 'a_completer'
  return 'apte'
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

/** Compte de connexion de la société (table `profiles`). */
export interface CompteSite {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  active: boolean | null
}

export interface CompteALier extends CompteSite {
  /** Même e-mail ou même nom que la fiche : très probablement le bon. */
  suggere: boolean
  estMoi: boolean
}

/** Minuscules, sans accents ni espaces superflus (« Lucas  BACHER » = « lucas bacher »). */
function normaliser(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Comptes qu'on peut relier à une fiche : ceux de la société qui ne sont reliés à
 * AUCUNE fiche. Le plus probable d'abord (même e-mail ou même nom), puis par nom.
 * Un compte président (le tien, celui d'un associé) n'est proposé que sur SA fiche
 * (même nom / e-mail) : sinon on relie par erreur la fiche d'un salarié à un compte admin.
 */
export function comptesALier(
  comptes: CompteSite[],
  idsDejaRelies: Iterable<string>,
  fiche: { full_name: string; email: string | null },
  monId: string | null | undefined,
): CompteALier[] {
  const relies = new Set(idsDejaRelies)
  const nom = normaliser(fiche.full_name)
  const mail = normaliser(fiche.email)
  return comptes
    .filter(c => !relies.has(c.id))
    .map(c => ({
      ...c,
      suggere: (!!mail && normaliser(c.email) === mail) || (!!nom && normaliser(c.full_name) === nom),
      estMoi: c.id === monId,
    }))
    .filter(c => c.suggere || c.role !== 'president')
    .sort((a, b) => Number(b.suggere) - Number(a.suggere)
      || normaliser(a.full_name || a.email).localeCompare(normaliser(b.full_name || b.email)))
}

/** E-mail saisi pour un nouvel accès qui appartient déjà à un compte de la société. */
export function compteDuMail(comptes: CompteSite[], email: string): CompteSite | null {
  const m = normaliser(email)
  if (!m) return null
  return comptes.find(c => normaliser(c.email) === m) ?? null
}

/** Message lisible d'un code d'erreur de l'Edge admin-users (règle partagée avec Administrateurs). */
export function libelleErreurAcces(code: string | null | undefined, detail?: string | null, message?: string | null): string {
  return libelleErreurAdmin({ error: code ?? undefined, detail: detail ?? undefined, message: message ?? undefined })
}

// ── Saisie de la fiche ───────────────────────────────────────────────────────

/** Salaire saisi en euros → centimes ; vide (ou illisible) = null, jamais 0. */
export function salaireSaisiCts(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** Date 'AAAA-MM-JJ' en français 'JJ/MM/AAAA' (sans passer par UTC). */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Date de fin de contrat à la désactivation : refus si avant l'entrée. */
export function erreurDateFin(dateFin: string, dateEntree: string | null | undefined): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFin)) return 'Date de fin requise.'
  if (dateEntree && dateFin < dateEntree) return 'La date de fin est avant la date d’entrée.'
  return null
}

// ── Export CSV ───────────────────────────────────────────────────────────────

function celluleCsv(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Export des membres (séparateur « ; », dates françaises). */
export function membresCsv(members: TeamMember[]): string {
  const entetes = ['Nom', 'Fonction', 'Contrat', 'Entrée', 'Sortie', 'Permis B (fin)', 'Prochaine visite médicale', 'Actif']
  const lignes = members.map(m => [
    m.full_name,
    m.role_label?.trim() || getRoleLabel(m.role),
    getContractLabel(m.contract_type),
    dateFr(m.start_date),
    dateFr(m.end_date),
    dateFr(m.licence_b_expiry),
    dateFr(m.medical_visit_expiry),
    m.active ? 'Oui' : 'Non',
  ])
  return [entetes, ...lignes].map(l => l.map(celluleCsv).join(';')).join('\n')
}
