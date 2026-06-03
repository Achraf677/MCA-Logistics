import { supabase } from '../../app/providers'
import type { ClientFilters, ClientInsert, ClientUpdate } from './clients.types'

export async function getClients(filters: ClientFilters = {}) {
  let q = supabase.from('clients').select('*').order('name')

  if (filters.active !== undefined) q = q.eq('active', filters.active)
  if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
  if (filters.search) {
    q = q.or(`name.ilike.%${filters.search}%,siret.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
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

export async function exportClientsCSV(filters: ClientFilters = {}) {
  const { data } = await getClients(filters)
  if (!data) return ''
  const headers = ['Nom', 'Type', 'SIRET', 'Email', 'Téléphone', 'Délai paiement', 'Actif']
  const rows = data.map(c => [
    c.name, c.type ?? '', c.siret ?? '', c.email ?? '', c.phone ?? '',
    `${c.payment_terms}j`, c.active ? 'Oui' : 'Non',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}
