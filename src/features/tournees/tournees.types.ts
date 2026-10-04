// Tournées — composition + optimisation de la tournée d'un véhicule sur une journée.

// La liste des statuts vit dans shared/ avec les règles qui s'appuient dessus
// (canStartTour / canFinishTour) : une liste ici et des règles là-bas auraient
// fini par ne plus parler des mêmes valeurs.
export type { StatutTournee } from '../../shared/lib/tourneeStatuts'
import type { StatutTournee } from '../../shared/lib/tourneeStatuts'

export type TourStatus = StatutTournee

export interface Tour {
  id: string
  company_id: string
  date: string
  vehicle_id: string | null
  driver_id: string | null
  status: TourStatus
  depot_lat: number | null
  depot_lng: number | null
  total_km: number | null
  total_duration_min: number | null
  geometry: string | null
  optimized_at: string | null
  notes: string | null
  /**
   * Demande d'eviter les peages (migration 20260911073000). N'agit QUE sur les
   * liens de navigation externes : l'optimisation de l'ordre des arrets ne sait
   * pas eviter les peages. Voir NavOptions dans tournees.logic.ts.
   */
  eviter_peages: boolean
  /** Départ du dépôt utilisé par l'optimisation (lot T3) ; null = ancienne tournée. */
  heure_depart?: string | null
  /** Posé par la base au premier « Démarrer » (trigger, lot T3). */
  started_at?: string | null
  created_at: string
  updated_at: string
}

/** Livraison telle que listée dans l'écran Tournées (jointure client allégée). */
export interface TourDelivery {
  id: string
  date: string
  statut: string
  description: string | null
  /** Poids de la marchandise, en kilogrammes. Sert au plan de chargement. */
  weight_kg: number | null
  pickup_address: string | null
  /**
   * true = la tournée inclut un arrêt de retrait avant la livraison
   * (migration 20260911200000). Coché à la main, jamais déduit.
   */
  retrait_a_faire: boolean
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  tour_id: string | null
  /** Positions dans la séquence unique des arrêts (retraits et livraisons). */
  stop_order: number | null
  pickup_order: number | null
  /** Heure prévue à la livraison, calculée par l'optimiseur. */
  arrival_time: string | null
  urgent: boolean | null
  creneau_retrait_debut: string | null
  creneau_retrait_fin: string | null
  creneau_livraison_debut: string | null
  creneau_livraison_fin: string | null
  /** Heure réelle de livraison (timestamptz). null = pas encore livré. */
  delivered_at: string | null
  /** Affectation posée sur la course (Planning, fiche, répartition). */
  driver_id: string | null
  vehicle_id: string | null
  clients: { name: string } | null
}

export interface Lookup {
  id: string
  label: string
}

/** Véhicule / chauffeur de l'écran, avec leurs échéances (contrôle T2). */
export interface VehiculeTournee extends Lookup {
  ct_expiry: string | null
  insurance_expiry: string | null
}
export interface ChauffeurTournee extends Lookup {
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
}

// ── Multi-véhicule (dispatch) ─────────────────────────────────────────────────

/** Affectation d'un véhicule (+ chauffeur optionnel) pour un dispatch multi-tournées. */
export interface Assignment {
  vehicle_id: string
  driver_id: string | null
}

/** Une tournée renvoyée par l'Edge Function optimize-tours. */
export interface DispatchedTour {
  tour_id: string
  vehicle_id: string
  stops: unknown[]
  total_km: number | null
  total_duration_min: number | null
}

/** Charge utile `data` de la réponse optimize-tours. */
export interface DispatchData {
  date: string
  tours: DispatchedTour[]
  /** L'Edge renvoie un NOMBRE (versions déployées) ; une liste reste acceptée. */
  unassigned: number | unknown[]
  /** Retraits à faire dont l'adresse n'a pas pu être localisée (lot T4). */
  retraits_non_localises?: number
}
