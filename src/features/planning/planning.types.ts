import type { DeliveryRow } from '../livraisons/livraisons.types'

/**
 * Une course telle que lue par le Planning (`select('*', …)`) : on y ajoute
 * le rattachement à une tournée, écrit par l'onglet Tournées, pour pouvoir
 * l'en détacher quand on la déplace.
 */
export type CoursePlanning = DeliveryRow & {
  tour_id?: string | null
  stop_order?: number | null
}

/** Membre de l'équipe relu pour le Planning (lignes + contrôle des documents). */
export interface ChauffeurPlanning {
  id: string
  full_name: string
  role: string | null
  /** Échéance du permis B (team_members.licence_b_expiry). */
  licence_b_expiry: string | null
  /** Échéance de la visite médicale (team_members.medical_visit_expiry). */
  medical_visit_expiry: string | null
}

/** Véhicule relu pour le contrôle des échéances à l'affectation. */
export interface VehiculePlanning {
  id: string
  label: string
  plate: string | null
  ct_expiry: string | null
  insurance_expiry: string | null
}

/** Une ligne de la vue par ressource : un chauffeur (ou « Non affecté »). */
export interface LigneRessource {
  /** null = « Non affecté ». */
  driverId: string | null
  nom: string
  /** Courses par jour 'AAAA-MM-JJ'. */
  cellules: Record<string, CoursePlanning[]>
  total: number
}

/** Filtres du bandeau « À traiter ». */
export type FiltreATraiter = 'sans_chauffeur' | 'sans_vehicule' | 'non_localisee' | 'retard' | 'echecs'

export interface CompteursATraiter {
  sans_chauffeur: number
  sans_vehicule: number
  non_localisee: number
  retard: number
  echecs: number
}

/** Cible d'un déplacement : chauffeur (null = retirer) et / ou jour. */
export interface CibleDeplacement {
  /** undefined = inchangé ; null = « Non affecté ». */
  driverId?: string | null
  /** undefined = inchangé. */
  date?: string
}
