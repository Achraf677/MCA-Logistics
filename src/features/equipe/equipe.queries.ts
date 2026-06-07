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
