// Accès DB charge_allocations — partagé (Trésorerie, Entretiens, Carburant).
// Vit dans shared/ : les 3 features consomment la ventilation sans import
// cross-feature. Logique pure dans allocations.ts / ventilation.ts.
import { supabase } from '../../app/providers'

export type AllocationTargetTable = 'qonto_transactions' | 'fuel_logs' | 'vehicle_maintenances'

/** Ligne charge_allocations avec jointures d'affichage (charge + catégorie). */
export interface AllocationRow {
  id: string
  charge_id: string
  target_table: AllocationTargetTable
  target_id: string
  amount_cts: number
  category_id: string | null
  note: string | null
  created_at: string
  charges: { label: string; montant_ttc_cts: number | null } | null
  charge_categories: { name: string } | null
}

export interface AllocationInsert {
  charge_id: string
  target_table: AllocationTargetTable
  target_id: string
  amount_cts: number
  category_id?: string | null
  note?: string | null
}

/** Allocations d'une cible, plus récentes en premier. */
export async function listAllocationsForTarget(
  target_table: AllocationTargetTable,
  target_id: string,
): Promise<{ data: AllocationRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('charge_allocations')
    .select(`
      id, charge_id, target_table, target_id, amount_cts, category_id, note, created_at,
      charges!charge_id(label, montant_ttc_cts),
      charge_categories!category_id(name)
    `)
    .eq('target_table', target_table)
    .eq('target_id', target_id)
    .order('created_at', { ascending: true })
  return {
    data: (data ?? []) as unknown as AllocationRow[],
    error: error ? new Error(error.message) : null,
  }
}

/** Ajoute une allocation. category_id par défaut = catégorie de la charge
 *  choisie (résolue par l'appelant — le picker connaît la charge). */
export async function addAllocation(payload: AllocationInsert) {
  return supabase.from('charge_allocations').insert({
    charge_id:    payload.charge_id,
    target_table: payload.target_table,
    target_id:    payload.target_id,
    amount_cts:   payload.amount_cts,
    category_id:  payload.category_id ?? null,
    note:         payload.note ?? null,
  }).select().single()
}

export async function removeAllocation(id: string) {
  return supabase.from('charge_allocations').delete().eq('id', id)
}

/** Catégories de charges (pour le select de ventilation). */
export async function listChargeCategories(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('charge_categories')
    .select('id, name')
    .order('name')
  return (data ?? []) as { id: string; name: string }[]
}
