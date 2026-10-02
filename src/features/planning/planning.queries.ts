import { supabase } from '../../app/providers'
import type { CoursePlanning, ChauffeurPlanning, VehiculePlanning } from './planning.types'
import type {
  VehiculeEcheanceSource, EntretienEcheanceSource, MembreEcheanceSource,
} from './mois.logic'

const JOINS = '*, clients!client_id(name), vehicles!vehicle_id(label, plate), team_members!driver_id(full_name)'

/** Relevés de messagerie et forfaits : rien à faire sur la route. */
const SUR_LA_ROUTE = 'prestation.is.null,prestation.not.in.(messagerie,forfait)'

export async function getDeliveriesForWeek(dateFrom: string, dateTo: string) {
  return supabase
    .from('deliveries')
    .select(JOINS)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .neq('statut', 'annulee')
    .or(SUR_LA_ROUTE)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<CoursePlanning[]>()
}

/**
 * Courses en retard : planifiées avant aujourd'hui et encore ouvertes
 * (planifiée / en cours), toutes dates passées confondues.
 */
export async function getCoursesEnRetard(aujourdhui: string) {
  return supabase
    .from('deliveries')
    .select(JOINS)
    .lt('date', aujourdhui)
    .in('statut', ['planifiee', 'en_cours'])
    .or(SUR_LA_ROUTE)
    .order('date', { ascending: true })
    .limit(200)
    .returns<CoursePlanning[]>()
}

/**
 * Équipe active (lignes du planning + contrôle des documents). Colonnes de
 * `team_members` relues ici (pas d'import de features/equipe).
 */
export async function getEquipePlanning() {
  return supabase
    .from('team_members')
    .select('id, full_name, role, licence_b_expiry, medical_visit_expiry')
    .eq('active', true)
    .order('full_name')
    .returns<ChauffeurPlanning[]>()
}

/** Véhicules et leurs échéances légales (contrôle à l'affectation). */
export async function getVehiculesPlanning() {
  return supabase
    .from('vehicles')
    .select('id, label, plate, ct_expiry, insurance_expiry')
    .order('label')
    .returns<VehiculePlanning[]>()
}

/** Garde-fou côté base : une course figée entre-temps n'est pas réécrite. */
const FIGES = '(facturee,payee,annulee)'

/**
 * Affecte / déplace des courses : chauffeur et / ou jour. Une course rattachée
 * à une tournée en est détachée (tour_id, stop_order, arrival_time remis à
 * null, comme le fait l'onglet Tournées) : sa tournée ne vaut plus pour un
 * autre jour ou un autre chauffeur.
 */
export async function deplacerCourses(
  ids: string[],
  maj: { driver_id?: string | null; date?: string },
  detacherDeTournee: string[],
) {
  // Deux lots disjoints, chacun écrit en une fois et cohérent à lui seul.
  const aDetacher = new Set(detacherDeTournee)
  const simples = ids.filter(id => !aDetacher.has(id))
  const detachees = ids.filter(id => aDetacher.has(id))
  if (simples.length) {
    const { error } = await supabase.from('deliveries').update(maj).in('id', simples).not('statut', 'in', FIGES)
    if (error) return { error }
  }
  if (detachees.length) {
    const { error } = await supabase
      .from('deliveries')
      .update({ ...maj, tour_id: null, stop_order: null, arrival_time: null })
      .in('id', detachees)
      .not('statut', 'in', FIGES)
    if (error) return { error }
  }
  return { error: null }
}

/**
 * Sources des échéances (vue Mois + en-têtes de jour de la semaine) (lecture seule, colonnes vérifiées dans
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
