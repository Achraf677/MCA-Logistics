import { supabase } from '../../app/providers'
import type { ChargePick } from '../types/charges'

export type RapprochementTarget = 'fuel_logs' | 'vehicle_maintenances'

/** Slug de type correspondant à chaque table cible. */
const TARGET_TYPE: Record<RapprochementTarget, string> = {
  fuel_logs:            'carburant',
  vehicle_maintenances: 'entretien',
}

/**
 * Retourne les charges non encore liées à la table cible,
 * filtrées par type (charges du bon type + non catégorisées).
 * Ex : fuel_logs → Carburant + category_id null. Jamais "Entretien" dans Carburant.
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
    .select('id, date, label, montant_ht_cts, montant_ttc_cts, tva_cts, tva_rate, receipt_url, pennylane_id, supplier_id, category_id, charge_categories!category_id(name, slug, type), suppliers!supplier_id(name)')
    // Immobilisations exclues : jamais candidates au rattachement carburant/entretien.
    .eq('est_immobilisation', false)
    .order('date', { ascending: false })
    .limit(200)

  if (linkedIds.length > 0) {
    q = q.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  const { data } = await q
  const rows = (data ?? []) as unknown as ChargePick[]

  // Filtre strict : uniquement les charges du type correspondant à la cible
  const targetType = TARGET_TYPE[target]
  return rows.filter(r => r.charge_categories?.type === targetType)
}
