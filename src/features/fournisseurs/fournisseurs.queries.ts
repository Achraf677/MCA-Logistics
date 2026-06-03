import { supabase } from '../../app/providers'
import type { SupplierFilters, SupplierInsert, SupplierUpdate } from './fournisseurs.types'

export async function getSuppliers(filters: SupplierFilters = {}) {
  let q = supabase.from('suppliers').select('*').order('name')

  if (filters.active !== undefined) q = q.eq('active', filters.active)
  if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category)
  if (filters.search) {
    const s = filters.search.replace(/[(),]/g, '')
    q = q.or(`name.ilike.%${s}%,siret.ilike.%${s}%`)
  }

  return q
}

export async function createSupplier(data: SupplierInsert) {
  return supabase.from('suppliers').insert(data).select().single()
}

export async function updateSupplier(id: string, data: SupplierUpdate) {
  return supabase.from('suppliers').update(data).eq('id', id).select().single()
}

export async function deactivateSupplier(id: string) {
  return supabase.from('suppliers').update({ active: false }).eq('id', id)
}
