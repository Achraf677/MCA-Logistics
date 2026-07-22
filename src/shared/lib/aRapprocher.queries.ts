// Query pour alimenter countARapprocher — chargée depuis Dashboard + AlertesBell.
// Lecture seule. Filtre côté SQL au maximum pour minimiser le transfert.
import { supabase } from '../../app/providers'
import {
  countARapprocher,
  type ARapprocherCounts,
  type ChargePick,
  type TxPick,
} from './aRapprocher'
import type { AllocationPick } from './allocations'

/**
 * Charge les transactions Qonto, les charges et les allocations nécessaires
 * au comptage puis renvoie les compteurs. Zéro écriture, cache-friendly.
 */
export async function getARapprocherCounts(): Promise<ARapprocherCounts> {
  // Toutes les transactions Qonto avec les champs utiles au comptage. On lit
  // tout car la classification "à rapprocher" dépend simultanément de charge_id,
  // justif_type et amount_cts — un filtre côté SQL par sous-critère perdrait
  // le miroir (b) Charges.
  const [txsRes, chargesRes, allocsRes] = await Promise.all([
    supabase
      .from('qonto_transactions')
      .select('id, side, amount_cts, charge_id, justif_type'),
    supabase
      .from('charges')
      // mode_paiement : introduit par la migration 20260716120000. Nécessaire
      // pour exclure les charges hors Qonto (note de frais, cash…) qui n'ont
      // pas vocation à être rapprochées à un mouvement bancaire.
      // pennylane_deleted_at : introduit par 20260721120000. Compte les
      // charges dont la facture a été supprimée côté Pennylane.
      // est_immobilisation : introduit par 20260724100000. Exclut les achats
      // d'investissement (véhicule…) du miroir "charges à rapprocher".
      .select('id, montant_ttc_cts, category_id, mode_paiement, pennylane_deleted_at, est_immobilisation'),
    // charge_allocations : introduit par 20260716130000. Permet le rapprochement
    // partiel (1 justif → N cibles, 1 cible ← N justifs). Rétrocompat totale
    // via le backfill de la migration (allocation "montant plein" pour chaque
    // charge_id historique). Absence de table = tableau vide OK.
    supabase
      .from('charge_allocations')
      .select('amount_cts, target_table, target_id, category_id'),
  ])
  const txs = (txsRes.data ?? []) as TxPick[]
  const charges = (chargesRes.data ?? []) as ChargePick[]
  const allocations = (allocsRes.data ?? []) as AllocationPick[]
  return countARapprocher(txs, charges, allocations)
}
