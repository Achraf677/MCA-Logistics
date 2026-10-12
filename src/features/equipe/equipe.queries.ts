import { supabase } from '../../app/providers'
import type { TeamFilters, TeamMemberInsert, TeamMemberUpdate } from './equipe.types'

export async function getTeamMembers(filters: TeamFilters = {}) {
  let q = supabase.from('team_members').select('*').order('full_name')

  if (filters.active !== undefined) q = q.eq('active', filters.active)
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

export async function deactivateTeamMember(id: string) {
  return supabase.from('team_members').update({ active: false }).eq('id', id)
}

export async function getMemberRecentDeliveries(memberId: string) {
  return supabase
    .from('deliveries')
    .select('id, date, delivery_address, statut')
    .eq('driver_id', memberId)
    .order('date', { ascending: false })
    .limit(10)
}

// ── Accès au site (lot S0) : Edge admin-users, réservée au président ──────────

type ReponseAdmin = { ok?: boolean; error?: string; detail?: string }

async function appelAdmin(body: Record<string, unknown>): Promise<ReponseAdmin> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (data) return data as ReponseAdmin
  // Corps d'erreur (400 / 403) : l'Edge y met le code lisible.
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try { return await ctx.json() as ReponseAdmin } catch { /* corps illisible */ }
  }
  return { ok: false, error: error?.message ?? 'appel impossible' }
}

/** Crée le compte du salarié (mot de passe donné ou invitation) et le relie à sa fiche. */
export function creerAccesSalarie(p: {
  teamMemberId: string; email: string; fullName: string
  mode: 'mot_de_passe' | 'invitation'; motDePasse?: string
}) {
  return appelAdmin({
    action: p.mode === 'mot_de_passe' ? 'create' : 'invite',
    email: p.email.trim(), full_name: p.fullName, password: p.motDePasse,
    role: 'chauffeur', team_member_id: p.teamMemberId,
  })
}

/** Relie un compte existant (ex. le sien, associé qui conduit) à une fiche. */
export function relierCompte(userId: string, teamMemberId: string) {
  return appelAdmin({ action: 'link_member', user_id: userId, team_member_id: teamMemberId })
}
