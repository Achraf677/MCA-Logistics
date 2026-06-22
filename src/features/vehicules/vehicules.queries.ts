import { supabase } from '../../app/providers'
import type { VehicleFilters, VehicleInsert, VehicleUpdate } from './vehicules.types'

export async function getVehicles(filters: VehicleFilters = {}) {
  let q = supabase.from('vehicles').select('*').order('label')

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.fuel_type && filters.fuel_type !== 'all') q = q.eq('fuel_type', filters.fuel_type)

  return q
}

export async function createVehicle(data: VehicleInsert) {
  return supabase.from('vehicles').insert(data).select().single()
}

export async function updateVehicle(id: string, data: VehicleUpdate) {
  return supabase.from('vehicles').update(data).eq('id', id).select().single()
}

export async function deleteVehicle(id: string) {
  return supabase.from('vehicles').delete().eq('id', id)
}

export async function getNextMaintenance(vehicleId: string) {
  return supabase
    .from('vehicle_maintenances')
    .select('next_due_date, next_due_km, type')
    .eq('vehicle_id', vehicleId)
    .not('next_due_date', 'is', null)
    .order('next_due_date')
    .limit(1)
    .single()
}
