/**
 * Course telle que vue par le chauffeur : strictement ce qu'il lui faut pour
 * rouler et livrer. Pas de montant, pas de client facturé, pas de TVA — un
 * chauffeur n'a pas besoin de savoir combien la course est vendue, et ne pas
 * charger l'information est plus simple que de la charger puis la masquer.
 */
export interface CourseChauffeur {
  id: string
  date: string
  statut: string
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  pod_captured_at: string | null
  weight_kg: number | null
  /** Horodatage du chargement (migration 20260913090000). null = pas encore chargé. */
  charge_le: string | null
  /** Signatures de la lettre de voiture — même format que côté bureau. */
  lv_signatures: {
    expediteur?: { png: string; ts: string; geo?: { lat: number; lng: number; acc?: number } }
    transporteur?: { png: string; ts: string; geo?: { lat: number; lng: number; acc?: number } }
    destinataire?: { png: string; ts: string; geo?: { lat: number; lng: number; acc?: number } }
  } | null
  expediteur_nom: string | null
  destinataire_nom: string | null
  pod_recipient_name: string | null
  /** Ordre imposé dans la journée (partagé avec les tournées). */
  stop_order: number | null
  /** Tournée de rattachement, quand le bureau en a composé une. */
  tour_id: string | null
  clients: { name: string; phone: string | null } | null
  vehicles: { label: string; plate: string } | null
}

/** Pièce jointe à une course, telle que le chauffeur la voit. */
export interface DocumentCourse {
  id: string
  entity_id: string
  file_name: string
  mime_type: string | null
  category: string | null
  storage_path: string | null
  /** Dernier recours pour les pièces pas encore rapatriées de Google Drive. */
  drive_link: string | null
  created_at: string
}

/**
 * La tournée du jour, réduite à ce qui sert au volant.
 *
 * Pas de `geometry`, pas de `notes`, pas d'`optimized_at` : un téléphone en
 * 4G qui charge un tracé de plusieurs dizaines de kilo-octets pour ne jamais
 * l'afficher, c'est de l'attente pure. Le tracé reste côté bureau, sur la
 * carte d'ensemble, là où il sert.
 */
export interface TourneeChauffeur {
  id: string
  date: string
  status: 'brouillon' | 'optimisee' | 'en_cours' | 'terminee'
  vehicle_id: string | null
  depot_lat: number | null
  depot_lng: number | null
  total_km: number | null
  total_duration_min: number | null
  eviter_peages: boolean
}
