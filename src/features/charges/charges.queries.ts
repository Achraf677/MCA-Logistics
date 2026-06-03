import { supabase } from '../../app/providers'
import type { ChargeFilters, ChargeInsert, ChargeRow, ChargeUpdate } from './charges.types'

const WITH_JOINS = '*, suppliers!supplier_id(name)'

export async function getCharges(filters: ChargeFilters = {}) {
  let q = supabase
    .from('charges')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category)
  if (filters.date_from) q = q.gte('date', filters.date_from)
  if (filters.date_to)   q = q.lte('date', filters.date_to)

  return q
}

export async function createCharge(data: ChargeInsert) {
  return supabase.from('charges').insert(data).select().single()
}

export async function updateCharge(id: string, data: ChargeUpdate) {
  return supabase.from('charges').update(data).eq('id', id).select().single()
}

export async function deleteCharge(id: string) {
  return supabase.from('charges').delete().eq('id', id)
}

export async function exportChargesCSV(filters: ChargeFilters = {}) {
  const { data } = await getCharges(filters)
  if (!data) return ''
  const rows = data as unknown as ChargeRow[]
  const headers = ['Date', 'Libellé', 'Catégorie', 'HT (€)', 'TVA%', 'TTC (€)', 'Fournisseur']
  const lines = rows.map(d => [
    d.date,
    d.label,
    d.category ?? '',
    (d.montant_ht_cts / 100).toFixed(2),
    d.tva_rate,
    d.montant_ttc_cts ? (d.montant_ttc_cts / 100).toFixed(2) : '',
    d.suppliers?.name ?? '',
  ])
  return [headers, ...lines].map(r => r.join(';')).join('\n')
}
