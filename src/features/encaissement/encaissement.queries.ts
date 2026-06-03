import { supabase } from '../../app/providers'
import type { PaymentFilters, PaymentInsert, PaymentUpdate } from './encaissement.types'

const WITH_JOINS = '*, clients!client_id(name), deliveries!delivery_id(date, montant_ttc_cts)'

export async function getPayments(filters: PaymentFilters = {}) {
  let q = supabase
    .from('payments')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.method && filters.method !== 'all') q = q.eq('method', filters.method)
  if (filters.client_id && filters.client_id !== 'all') q = q.eq('client_id', filters.client_id)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createPayment(data: PaymentInsert) {
  return supabase.from('payments').insert(data).select().single()
}

export async function updatePayment(id: string, data: PaymentUpdate) {
  return supabase.from('payments').update(data).eq('id', id).select().single()
}

export async function deletePayment(id: string) {
  return supabase.from('payments').delete().eq('id', id)
}

export async function exportPaymentsCSV(filters: PaymentFilters = {}) {
  const { data } = await getPayments(filters)
  if (!data) return ''
  const headers = ['Date', 'Client', 'Montant (€)', 'Mode', 'Référence', 'Notes']
  const rows = (data as Record<string, unknown>[]).map(d => [
    d.date,
    (d.clients as { name: string } | null)?.name ?? '',
    ((d.amount_cts as number) / 100).toFixed(2),
    d.method ?? '',
    d.reference ?? '',
    d.notes ?? '',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}
