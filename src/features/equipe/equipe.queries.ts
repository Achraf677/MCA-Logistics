import { supabase } from '../../app/providers'
import { creerCompte, relierFiche, appelPermissions } from '../../shared/lib/adminUsers.queries'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
import type { TeamFilters, TeamMemberInsert, TeamMemberUpdate } from './equipe.types'
import { fusionnerComptes, type CompteConnexion, type FicheLien } from './equipe.logic'

export async function getTeamMembers(filters: TeamFilters = {}) {
  let q = supabase.from('team_members').select('*').order('full_name')

  if (filters.active !== undefined) q = q.eq('active', filters.active)
  if (filters.role && filters.role !== 'all') q = q.eq('role', filters.role)
  if (filters.contract_type && filters.contract_type !== 'all') {
    q = q.eq('contract_type', filters.contract_type)
  }

  return q
}

export async function createTeamMember(data: TeamMemberInsert) {
  return supabase.from('team_members').insert(data).select().single()
}

export async function updateTeamMember(id: string, data: TeamMemberUpdate) {
  return supabase.from('team_members').update(data).eq('id', id).select().single()
}

/** Sortie d'un membre : inactif + date de fin de contrat (l'accès au site se coupe à part). */
export async function deactivateTeamMember(id: string, endDate: string) {
  return supabase.from('team_members').update({ active: false, end_date: endDate }).eq('id', id)
}

export async function getMemberRecentDeliveries(memberId: string) {
  return supabase
    .from('deliveries')
    .select('id, date, delivery_address, statut')
    .eq('driver_id', memberId)
    // Relevés de messagerie et forfaits : sans adresse ni course réelle.
    .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
    .order('date', { ascending: false })
    .limit(10)
}

// ── Accès au site (lot S0) : Edge admin-users, réservée au président ──────────
// L'appel et la lecture des erreurs vivent dans shared/lib/adminUsers.queries
// (partagés avec Système › Administrateurs).

/** Crée le compte du salarié (rôle « chauffeur », mot de passe donné) et le relie à sa fiche. */
export function creerAccesSalarie(p: { teamMemberId: string; email: string; fullName: string; motDePasse: string }) {
  return creerCompte({
    mode: 'mot_de_passe', email: p.email, fullName: p.fullName, motDePasse: p.motDePasse,
    role: 'chauffeur', teamMemberId: p.teamMemberId,
  })
}

/**
 * TOUS les comptes de connexion de la société (Edge `list_members` : e-mail Auth,
 * dernière connexion) et les fiches Équipe (qui est relié à quoi). L'Edge en échec
 * → repli sur `profiles` (la RLS limite à la société), sans dernière connexion.
 */
export async function getComptesEtFiches(): Promise<{ comptes: CompteConnexion[]; fiches: FicheLien[]; error: string | null }> {
  const [edge, profils, fiches] = await Promise.all([
    appelPermissions<{ members: CompteConnexion[] }>({ action: 'list_members' }),
    supabase.from('profiles').select('id, full_name, email, role, active').order('full_name'),
    supabase.from('team_members').select('id, full_name, email, profile_id, active').order('full_name'),
  ])
  const membres = edge.ok && Array.isArray(edge.members) ? edge.members : null
  if (!membres && profils.error) return { comptes: [], fiches: [], error: libelleErreurAdmin(edge) }
  if (fiches.error) return { comptes: [], fiches: [], error: fiches.error.message }
  return {
    comptes: fusionnerComptes(membres, (profils.data ?? []) as CompteConnexion[]),
    fiches: (fiches.data ?? []) as FicheLien[],
    error: null,
  }
}

/** E-mail enregistré sur la fiche quand elle n'en avait pas (accès donné). */
export async function enregistrerEmailFiche(id: string, email: string) {
  return supabase.from('team_members').update({ email }).eq('id', id).or('email.is.null,email.eq.')
}

/** Rôle de chaque compte de connexion (colonne « Accès au site » de la liste). */
export async function getRolesComptes(): Promise<Record<string, string>> {
  const { data } = await supabase.from('profiles').select('id, role')
  const roles: Record<string, string> = {}
  for (const p of (data ?? []) as Array<{ id: string; role: string | null }>) if (p.role) roles[p.id] = p.role
  return roles
}

/** Relie un compte existant de la société (le salarié, ou le sien) à une fiche. */
export function relierCompte(userId: string, teamMemberId: string) {
  return relierFiche(userId, teamMemberId)
}
