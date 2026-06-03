import { supabase } from '../../app/providers'
import type { IncidentFilters, IncidentInsert, IncidentUpdate } from './incidents.types'

const WITH_JOINS = '*, vehicles!vehicle_id(label, plate), team_members!driver_id(full_name)'

export async function getIncidents(filters: IncidentFilters = {}) {
  let q = supabase
    .from('incidents')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.type && filters.type !== 'all')     q = q.eq('type', filters.type)
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createIncident(data: IncidentInsert) {
  return supabase.from('incidents').insert(data).select().single()
}

export async function updateIncident(id: string, data: IncidentUpdate) {
  return supabase.from('incidents').update(data).eq('id', id).select().single()
}

export async function deleteIncident(id: string) {
  return supabase.from('incidents').delete().eq('id', id)
}
