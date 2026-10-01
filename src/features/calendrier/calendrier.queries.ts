import { supabase } from '../../app/providers'
import type {
  VehiculeEcheanceSource, EntretienEcheanceSource, MembreEcheanceSource,
} from './calendrier.logic'

/**
 * Sources des échéances du calendrier (lecture seule, colonnes vérifiées dans
 * supabase/schema.sql). Les courses restent lues par `livraisons.queries`
 * (exception d'import existante) : le clic ouvre la fiche livraison complète.
 *
 * - vehicles : assurance, CT, révision (les inactifs sont filtrés en logique).
 * - vehicle_maintenances : TOUT l'historique (petit volume) — la logique ne garde
 *   que le dernier entretien de chaque (véhicule, type), sinon une échéance déjà
 *   remplacée par un entretien plus récent réapparaîtrait.
 * - team_members : permis B, visite médicale (aucune donnée de paie lue).
 *
 * Une source en erreur (droits, réseau) ne bloque pas les autres : liste vide.
 */
export async function getSourcesEcheances(): Promise<{
  vehicules: VehiculeEcheanceSource[]
  entretiens: EntretienEcheanceSource[]
  membres: MembreEcheanceSource[]
}> {
  const [vRes, eRes, mRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, label, plate, status, ct_expiry, insurance_expiry, next_revision_date'),
    supabase
      .from('vehicle_maintenances')
      .select('id, vehicle_id, type, date, next_due_date'),
    supabase
      .from('team_members')
      .select('id, full_name, active, licence_b_expiry, medical_visit_expiry'),
  ])
  return {
    vehicules: (vRes.data as VehiculeEcheanceSource[] | null) ?? [],
    entretiens: (eRes.data as EntretienEcheanceSource[] | null) ?? [],
    membres: (mRes.data as MembreEcheanceSource[] | null) ?? [],
  }
}
