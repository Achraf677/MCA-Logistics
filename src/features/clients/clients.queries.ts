import { supabase } from '../../app/providers'
import type { ClientFilters, ClientInsert, ClientUpdate, DeliveryForEncours } from './clients.types'

export async function getClients(filters: ClientFilters = {}) {
  let q = supabase.from('clients').select('*').order('name')

  if (filters.active !== undefined) q = q.eq('active', filters.active)
  if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
  if (filters.search) {
    const s = filters.search.replace(/[(),]/g, '')
    q = q.or(`name.ilike.%${s}%,siret.ilike.%${s}%,email.ilike.%${s}%`)
  }

  return q
}

export async function createClient(data: ClientInsert) {
  return supabase.from('clients').insert(data).select().single()
}

export async function updateClient(id: string, data: ClientUpdate) {
  return supabase.from('clients').update(data).eq('id', id).select().single()
}

export async function deactivateClient(id: string) {
  return supabase.from('clients').update({ active: false }).eq('id', id)
}

/** Compte les livraisons rattachées à un client (garde-fou avant suppression). */
export async function countDeliveriesForClient(id: string): Promise<number> {
  const { count } = await supabase
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', id)
  return count ?? 0
}

// Suppression (RLS : président uniquement, via clients_delete_president).
// Interdite côté UI si le client a des livraisons (voir countDeliveriesForClient).
export async function deleteClient(id: string) {
  return supabase.from('clients').delete().eq('id', id)
}

/** Read-only: fetches factured (unpaid) deliveries for all clients — used to compute encours KPIs */
export async function getFacturedDeliveries(): Promise<{ data: DeliveryForEncours[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, client_id, statut, amount_ttc_cts, invoiced_at')
    .eq('statut', 'facturee')

  return { data: data as DeliveryForEncours[] | null, error }
}

/** Read-only: fetches deliveries for a single client (all statuts) — used in the DrawerClient tabs */
export async function getClientDeliveries(clientId: string): Promise<{ data: (DeliveryForEncours & { date: string; description: string | null })[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, statut, amount_ttc_cts, invoiced_at, date, description')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(50)

  return { data: data as (DeliveryForEncours & { date: string; description: string | null })[] | null, error }
}

export async function exportClientsCSV(filters: ClientFilters = {}) {
  const { data } = await getClients(filters)
  if (!data) return ''
  const headers = ['Nom', 'Type', 'SIRET', 'Email', 'Téléphone', 'Délai paiement', 'Tarif', 'Actif']
  const rows = data.map(c => [
    c.name, c.type ?? '', c.siret ?? '', c.email ?? '', c.phone ?? '',
    `${c.payment_terms}j`, c.tariff_mode, c.active ? 'Oui' : 'Non',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}
