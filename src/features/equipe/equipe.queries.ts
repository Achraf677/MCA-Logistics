import { supabase } from '../../app/providers'
import { creerCompte, relierFiche } from '../../shared/lib/adminUsers.queries'
import type { TeamFilters, TeamMemberInsert, TeamMemberUpdate } from './equipe.types'

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

/** Crée le compte du salarié (mot de passe donné ou invitation) et le relie à sa fiche. */
export function creerAccesSalarie(p: {
  teamMemberId: string; email: string; fullName: string
  mode: 'mot_de_passe' | 'invitation'; motDePasse?: string
}) {
  return creerCompte({
    mode: p.mode, email: p.email, fullName: p.fullName, motDePasse: p.motDePasse,
    role: 'chauffeur', teamMemberId: p.teamMemberId,
  })
}

/** Relie un compte existant (ex. le sien, associé qui conduit) à une fiche. */
export function relierCompte(userId: string, teamMemberId: string) {
  return relierFiche(userId, teamMemberId)
}

// ── Messagerie (lot S1) ──────────────────────────────────────────────────────
