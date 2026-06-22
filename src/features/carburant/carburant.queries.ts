import { supabase } from '../../app/providers'
import type { FuelFilters, FuelLogInsert, FuelLogRow, FuelLogUpdate } from './carburant.types'

const WITH_JOINS = [
  '*',
  'vehicles!vehicle_id(label, plate)',
  'team_members!driver_id(full_name)',
  'charges!charge_id(id, label, montant_ttc_cts, receipt_url, pennylane_id)',
].join(', ')

export async function getFuelLogs(filters: FuelFilters = {}) {
  let q = supabase
    .from('fuel_logs')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.vehicle_id && filters.vehicle_id !== 'all') q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createFuelLog(data: FuelLogInsert) {
  return supabase.from('fuel_logs').insert(data).select().single()
}

export async function updateFuelLog(id: string, data: FuelLogUpdate) {
  return supabase.from('fuel_logs').update(data).eq('id', id).select().single()
}

export async function deleteFuelLog(id: string) {
  return supabase.from('fuel_logs').delete().eq('id', id)
}

// Retourne les charges non encore liées à un fuel_log (pour le sélecteur de rapprochement).
export async function getUnlinkedCharges() {
  // Étape 1 : charge_ids déjà rapprochés
  const { data: linked } = await supabase
    .from('fuel_logs')
    .select('charge_id')
    .not('charge_id', 'is', null)

  const linkedIds = (linked ?? []).map(r => (r as { charge_id: string }).charge_id).filter(Boolean)

  // Étape 2 : charges non dans cette liste
  let q = supabase
    .from('charges')
    .select('id, date, label, montant_ht_cts, montant_ttc_cts, tva_cts, tva_rate, receipt_url, pennylane_id, supplier_id, category, suppliers!supplier_id(name)')
    .order('date', { ascending: false })
    .limit(200)

  if (linkedIds.length > 0) {
    q = q.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  return q
}

export async function exportFuelCSV(filters: FuelFilters = {}) {
  const { data } = await getFuelLogs(filters)
  if (!data) return ''
  const rows = data as unknown as FuelLogRow[]
  const headers = ['Date', 'Véhicule', 'Immat.', 'Chauffeur', 'Litres', '€/L', 'Total TTC (€)', 'Carburant', 'km', 'Station', 'Facturé']
  const lines = rows.map(d => [
    d.date,
    d.vehicles?.label ?? '',
    d.vehicles?.plate ?? '',
    d.team_members?.full_name ?? '',
    d.liters,
    (d.price_per_liter_cts / 100).toFixed(3),
    (d.total_cts / 100).toFixed(2),
    d.fuel_type ?? '',
    d.mileage_km ?? '',
    d.station ?? '',
    d.charges ? 'Oui' : 'Non',
  ])
  return [headers, ...lines].map(r => r.join(';')).join('\n')
}
