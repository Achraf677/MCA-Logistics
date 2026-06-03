import { supabase } from '../../app/providers'
import type { WorkHourFilters, WorkHourInsert, WorkHourUpdate } from './heures.types'

const WITH_JOINS = '*, team_members!member_id(full_name), deliveries!delivery_id(clients!client_id(name))'

export async function getWorkHours(filters: WorkHourFilters = {}) {
  let q = supabase
    .from('work_hours')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.member_id && filters.member_id !== 'all') q = q.eq('member_id', filters.member_id)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createWorkHour(data: WorkHourInsert) {
  return supabase.from('work_hours').insert(data).select().single()
}

export async function updateWorkHour(id: string, data: WorkHourUpdate) {
  return supabase.from('work_hours').update(data).eq('id', id).select().single()
}

export async function deleteWorkHour(id: string) {
  return supabase.from('work_hours').delete().eq('id', id)
}
