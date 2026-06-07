// Tournées — composition + optimisation de la tournée d'un véhicule sur une journée.

export type TourStatus = 'brouillon' | 'optimisee' | 'en_cours' | 'terminee'

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
  created_at: string
  updated_at: string
}

/** Livraison telle que listée dans l'écran Tournées (jointure client allégée). */
export interface TourDelivery {
  id: string
  date: string
  statut: string
  description: string | null
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  tour_id: string | null
  stop_order: number | null
  arrival_time: string | null
  /** Heure réelle de livraison (timestamptz). null = pas encore livré. */
  delivered_at: string | null
  clients: { name: string } | null
}

/** Réponse de l'Edge Function optimize-tour. */
export interface OptimizeResult {
  ok: boolean
  data?: {
    stops?: unknown[]
    total_km?: number
    total_duration_min?: number
    order?: number[]
  }
  error?: string
  body?: unknown
}

export interface Lookup {
  id: string
  label: string
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
  unassigned: unknown[]
}
