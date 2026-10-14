import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import { libelleErreurAdmin, libelleDerniereConnexion } from '../../shared/lib/adminUsers'
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

// ── Accès au site : un salarié = un compte (e-mail → « Donner l'accès ») ───────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** E-mail de connexion : null si valide, sinon le message. */
export function erreurEmail(email: string): string | null {
  return EMAIL.test(email.trim()) ? null : 'E-mail invalide.'
}

/** Compte de connexion de la société (Edge admin-permissions `list_members`, sinon `profiles`). */
export interface CompteConnexion {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  active: boolean | null
  /** Absent (undefined) tant que l'Edge n'est pas redéployée : afficher « — ». */
  last_sign_in_at?: string | null
}

/** Fiche Équipe, vue depuis les comptes (qui est relié à quoi). */
export interface FicheLien {
  id: string
  full_name: string
  email: string | null
  profile_id: string | null
  active?: boolean | null
}

/** Minuscules, sans accents ni espaces superflus (« Lucas  BACHER » = « lucas bacher »). */
function normaliser(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Comptes lus par l'Edge (e-mail Auth, dernière connexion) complétés par `profiles`
 * (e-mail du profil si l'Auth n'en donne pas). Edge en échec → `profiles` seuls.
 */
export function fusionnerComptes(edge: CompteConnexion[] | null, profils: CompteConnexion[]): CompteConnexion[] {
  if (!edge) return profils.map(p => ({ ...p }))
  const parId = new Map(profils.map(p => [p.id, p]))
  return edge.map(c => ({ ...c, email: c.email ?? parId.get(c.id)?.email ?? null }))
}

/**
 * Un compte président (le tien, celui d'un associé) ne se relie qu'à SA fiche :
 * même e-mail ENREGISTRÉ sur la fiche, ou même nom. Sinon on relierait par
 * erreur la fiche d'un salarié à un compte admin.
 */
export function presidentSurAutreFiche(
  compte: Pick<CompteConnexion, 'role' | 'email' | 'full_name'>,
  fiche: { full_name: string; email: string | null },
): boolean {
  if (compte.role !== 'president') return false
  const memeMail = !!normaliser(fiche.email) && normaliser(fiche.email) === normaliser(compte.email)
  const memeNom = !!normaliser(fiche.full_name) && normaliser(fiche.full_name) === normaliser(compte.full_name)
  return !(memeMail || memeNom)
}

export type DecisionAcces =
  | { type: 'invalide'; message: string }
  /** Un compte de la société a cet e-mail et n'est relié à aucune fiche : on le relie. */
  | { type: 'relier'; compte: CompteConnexion }
  /** Ce compte est déjà relié à une autre fiche : on le dit, on ne fait rien. */
  | { type: 'relie_ailleurs'; compte: CompteConnexion; fiche: string }
  /** Compte président, fiche d'un autre : refusé. */
  | { type: 'president'; compte: CompteConnexion }
  /** Aucun compte de la société n'a cet e-mail : on le crée. */
  | { type: 'creer' }

/** « Donner l'accès » : que faire de l'e-mail saisi pour cette fiche ? */
export function decisionDonnerAcces(
  email: string,
  fiche: { id: string; full_name: string; email: string | null },
  comptes: CompteConnexion[],
  fiches: FicheLien[],
): DecisionAcces {
  const err = erreurEmail(email)
  if (err) return { type: 'invalide', message: err }
  const m = normaliser(email)
  const compte = comptes.find(c => normaliser(c.email) === m)
  if (!compte) return { type: 'creer' }
  const autre = fiches.find(f => f.profile_id === compte.id && f.id !== fiche.id)
  if (autre) return { type: 'relie_ailleurs', compte, fiche: autre.full_name }
  if (presidentSurAutreFiche(compte, fiche)) return { type: 'president', compte }
  return { type: 'relier', compte }
}

/** Ligne de l'onglet « Comptes ». */
export interface LigneCompte extends CompteConnexion {
  fiche: FicheLien | null
  estMoi: boolean
  /** Couper, mot de passe, supprimer : jamais sur soi ni sur un président (refus serveur). */
  modifiable: boolean
}

/** Tous les comptes, avec leur fiche ; les comptes sans fiche d'abord, puis par nom. */
export function lignesComptes(
  comptes: CompteConnexion[], fiches: FicheLien[], monId: string | null | undefined,
): LigneCompte[] {
  const ficheDe = new Map<string, FicheLien>()
  for (const f of fiches) if (f.profile_id) ficheDe.set(f.profile_id, f)
  return comptes
    .map(c => ({
      ...c,
      fiche: ficheDe.get(c.id) ?? null,
      estMoi: c.id === monId,
      modifiable: c.id !== monId && c.role !== 'president',
    }))
    .sort((a, b) => Number(!!a.fiche) - Number(!!b.fiche)
      || normaliser(a.full_name || a.email).localeCompare(normaliser(b.full_name || b.email)))
}

/** Fiches sans compte auxquelles ce compte peut être relié. */
export function fichesLiables(compte: CompteConnexion, fiches: FicheLien[]): FicheLien[] {
  return fiches
    .filter(f => !f.profile_id && !presidentSurAutreFiche(compte, f))
    .sort((a, b) => Number(b.active !== false) - Number(a.active !== false)
      || normaliser(a.full_name).localeCompare(normaliser(b.full_name)))
}

/** Dernière connexion d'un compte : « — » si l'Edge ne la donne pas encore. */
export function libelleConnexionCompte(iso: string | null | undefined): string {
  return iso === undefined ? '—' : libelleDerniereConnexion(iso)
}

// Sans caractères ambigus : ni 0/O/o, ni 1/l/I/i.
const MINUSCULES = 'abcdefghjkmnpqrstuvwxyz'
const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const CHIFFRES = '23456789'
const ALPHABET = MINUSCULES + MAJUSCULES + CHIFFRES

/** Source d'aléa : remplit le tableau (par défaut `crypto.getRandomValues`). */
export type Alea = (t: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>

/**
 * Mot de passe lisible, à dicter ou copier : 3 groupes de 4 séparés par « - »
 * (14 caractères, ex. « Kp7m-Xr4t-Wq9z »), au moins une minuscule, une majuscule
 * et un chiffre, sans caractères ambigus. Tirage sans biais (rejet).
 */
export function genererMotDePasse(alea: Alea = t => crypto.getRandomValues(t)): string {
  const n = ALPHABET.length
  const limite = Math.floor(0x100000000 / n) * n
  const tirer = (): string => {
    const buf = new Uint32Array(new ArrayBuffer(4))
    for (;;) {
      const v = alea(buf)[0]
      if (v < limite) return ALPHABET[v % n]
    }
  }
  for (let essai = 0; essai < 1000; essai++) {
    const brut = Array.from({ length: 12 }, tirer).join('')
    if (/[a-z]/.test(brut) && /[A-Z]/.test(brut) && /[2-9]/.test(brut)) {
      return `${brut.slice(0, 4)}-${brut.slice(4, 8)}-${brut.slice(8, 12)}`
    }
  }
  throw new Error('Générateur de mot de passe : source d’aléa défaillante.')
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
