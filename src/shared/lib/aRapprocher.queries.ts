// Query pour alimenter countARapprocher — chargée depuis Dashboard + AlertesBell. Lecture seule.
import { supabase } from '../../app/providers'
import { countARapprocher, type ARapprocherCounts, type ChargePick } from './aRapprocher'

export async function getARapprocherCounts(): Promise<ARapprocherCounts> {
  const { data } = await supabase
    .from('charges')
    // pennylane_deleted_at : facture supprimée côté Pennylane ; pennylane_id + date : charges qui n'existent
    // que dans le site ; est_immobilisation : investissements exclus ; mode_paiement : canal de paiement.
    .select('id, montant_ttc_cts, category_id, mode_paiement, pennylane_deleted_at, est_immobilisation, pennylane_id, date')
  return countARapprocher((data ?? []) as ChargePick[])
}
