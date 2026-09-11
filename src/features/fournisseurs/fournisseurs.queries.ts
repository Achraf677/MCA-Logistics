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

export async function deleteSupplier(id: string) {
  return supabase.from('suppliers').delete().eq('id', id)
}

/**
 * Charges des 12 derniers mois, reduites aux trois champs qui servent au
 * cumul par fournisseur.
 *
 * Fenetre glissante de 12 mois et pas « depuis toujours » : ce qu'on veut
 * savoir en ouvrant cet ecran, c'est chez qui on depense EN CE MOMENT. Un
 * fournisseur quitte il y a trois ans n'a rien a faire en tete de liste.
 *
 * La selection est volontairement maigre : sur plusieurs milliers de lignes,
 * rapatrier la table entiere pour n'en additionner qu'une colonne serait du
 * gaspillage pur.
 */
export async function getChargesDouzeMois() {
  const debut = new Date()
  debut.setUTCFullYear(debut.getUTCFullYear() - 1)
  return supabase
    .from('charges')
    .select('supplier_id, date, montant_ht_cts, est_immobilisation')
    .gte('date', debut.toISOString().slice(0, 10))
    .not('supplier_id', 'is', null)
}
