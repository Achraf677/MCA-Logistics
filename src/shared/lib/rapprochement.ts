import { supabase } from '../../app/providers'
import type { ChargePick } from '../types/charges'

export type RapprochementTarget = 'fuel_logs' | 'vehicle_maintenances'

/**
 * Retourne les charges non encore liées à la table cible.
 * Utilisé par les sélecteurs de rapprochement (carburant, entretiens…).
 */
export async function getUnlinkedChargesFor(target: RapprochementTarget): Promise<ChargePick[]> {
  const { data: linked } = await supabase
    .from(target)
    .select('charge_id')
    .not('charge_id', 'is', null)

  const linkedIds = (linked ?? [])
    .map(r => (r as { charge_id: string }).charge_id)
    .filter(Boolean)

  let q = supabase
    .from('charges')
    .select('id, date, label, montant_ht_cts, montant_ttc_cts, tva_cts, tva_rate, receipt_url, pennylane_id, supplier_id, category, suppliers!supplier_id(name)')
    .order('date', { ascending: false })
    .limit(200)

  if (linkedIds.length > 0) {
    q = q.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  const { data } = await q
  return (data ?? []) as unknown as ChargePick[]
}
