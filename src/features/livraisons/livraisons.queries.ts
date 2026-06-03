import { supabase } from '../../app/providers'
import type { DeliveryFilters, DeliveryInsert, DeliveryStatus, DeliveryUpdate } from './livraisons.types'

const WITH_JOINS = '*, clients!client_id(name), vehicles!vehicle_id(label), team_members!driver_id(full_name)'

export async function getDeliveries(filters: DeliveryFilters = {}) {
  let q = supabase
    .from('deliveries')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.statut && filters.statut !== 'all') q = q.eq('statut', filters.statut)
  if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to) q = q.lte('date', filters.date_to)

  return q
}

export async function createDelivery(data: DeliveryInsert) {
  return supabase.from('deliveries').insert(data).select().single()
}

export async function updateDelivery(id: string, data: DeliveryUpdate) {
  return supabase.from('deliveries').update(data).eq('id', id).select().single()
}

export async function advanceStatut(id: string, statut: DeliveryStatus) {
  return supabase.from('deliveries').update({ statut }).eq('id', id).select().single()
}

export async function exportDeliveriesCSV(filters: DeliveryFilters = {}) {
  const { data } = await getDeliveries(filters)
  if (!data) return ''
  const headers = ['Date', 'Client', 'Type', 'Véhicule', 'Chauffeur', 'HT (€)', 'TVA%', 'TTC (€)', 'Statut', 'km']
  const rows = (data as Record<string, unknown>[]).map(d => [
    d.date,
    (d.clients as { name: string } | null)?.name ?? '',
    d.type ?? '',
    (d.vehicles as { label: string } | null)?.label ?? '',
    (d.team_members as { full_name: string } | null)?.full_name ?? '',
    ((d.montant_ht_cts as number) / 100).toFixed(2),
    d.tva_rate,
    ((d.montant_ttc_cts as number) / 100).toFixed(2),
    d.statut,
    d.km ?? '',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}
