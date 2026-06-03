import { supabase } from '../../app/providers'
import type { MaintenanceFilters, MaintenanceInsert, MaintenanceUpdate } from './entretiens.types'

const WITH_JOINS = '*, vehicles!vehicle_id(label, plate), suppliers!supplier_id(name)'

export async function getMaintenances(filters: MaintenanceFilters = {}) {
  let q = supabase
    .from('vehicle_maintenances')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.vehicle_id && filters.vehicle_id !== 'all') q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.type && filters.type !== 'all')             q = q.eq('type', filters.type)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createMaintenance(data: MaintenanceInsert) {
  return supabase.from('vehicle_maintenances').insert(data).select().single()
}

export async function updateMaintenance(id: string, data: MaintenanceUpdate) {
  return supabase.from('vehicle_maintenances').update(data).eq('id', id).select().single()
}

export async function deleteMaintenance(id: string) {
  return supabase.from('vehicle_maintenances').delete().eq('id', id)
}
