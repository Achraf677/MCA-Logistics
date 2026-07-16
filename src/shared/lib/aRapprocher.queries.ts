// Query pour alimenter countARapprocher — chargée depuis Dashboard + AlertesBell.
// Lecture seule. Filtre côté SQL au maximum pour minimiser le transfert.
import { supabase } from '../../app/providers'
import {
  countARapprocher,
  type ARapprocherCounts,
  type ChargePick,
  type TxPick,
} from './aRapprocher'

/**
 * Charge les transactions Qonto et les charges nécessaires au comptage puis
 * renvoie les compteurs. Zéro écriture, cache-friendly.
 */
export async function getARapprocherCounts(): Promise<ARapprocherCounts> {
  // Toutes les transactions Qonto avec les champs utiles au comptage. On lit
  // tout car la classification "à rapprocher" dépend simultanément de charge_id,
  // justif_type et amount_cts — un filtre côté SQL par sous-critère perdrait
  // le miroir (b) Charges.
  const [txsRes, chargesRes] = await Promise.all([
    supabase
      .from('qonto_transactions')
      .select('side, amount_cts, charge_id, justif_type'),
    supabase
      .from('charges')
      .select('id, montant_ttc_cts'),
  ])
  const txs = (txsRes.data ?? []) as TxPick[]
  const charges = (chargesRes.data ?? []) as ChargePick[]
  return countARapprocher(txs, charges)
}
