import { supabase } from '../../app/providers'
import type { InspectionFilters, InspectionInsert, InspectionUpdate } from './inspections.types'

const WITH_JOINS = '*, vehicles!vehicle_id(label, plate), team_members!driver_id(full_name)'

export async function getInspections(filters: InspectionFilters = {}) {
  let q = supabase
    .from('vehicle_inspections')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.vehicle_id && filters.vehicle_id !== 'all') q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.status && filters.status !== 'all')         q = q.eq('status', filters.status)
  if (filters.type && filters.type !== 'all')             q = q.eq('type', filters.type)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createInspection(data: InspectionInsert) {
  return supabase.from('vehicle_inspections').insert(data).select().single()
}

export async function updateInspection(id: string, data: InspectionUpdate) {
  return supabase.from('vehicle_inspections').update(data).eq('id', id).select().single()
}

export async function deleteInspection(id: string) {
  return supabase.from('vehicle_inspections').delete().eq('id', id)
}
