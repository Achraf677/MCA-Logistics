// V2 statuses — machine à états gardée (planifiee → en_cours → livree → facturee → payee)
export type DeliveryStatus =
  | 'planifiee'
  | 'en_cours'
  | 'livree'
  | 'facturee'
  | 'payee'
  | 'annulee'

export type DeliveryType = 'medical' | 'ecommerce' | 'retail' | 'particulier'

export interface Delivery {
  id: string
  company_id: string
  client_id: string
  vehicle_id: string | null
  driver_id: string | null
  /** DB column 'date' — date planifiée */
  date: string
  type: DeliveryType | null
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  /** Coordonnées géocodées de l'adresse de livraison (Photon). */
  delivery_lat: number | null
  delivery_lng: number | null
  /** DB column 'km' — distance en km (tarif km) */
  km: number | null
  /** DB column 'empty_km' — km parcourus à vide (optionnel) */
  empty_km: number | null
  /** DB column 'weight_kg' — utilisé comme nb palettes (tarif palette) */
  weight_kg: number | null
  // Colonnes legacy (rétro-compat)
  montant_ht_cts: number
  tva_rate: number
  montant_ttc_cts: number | null
  // Colonnes v2 (delta migration)
  amount_ht_cts: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  invoiced_at: string | null
  paid_at: string | null
  // Statut (text en DB, valeurs v2)
  statut: string
  pennylane_invoice_id: string | null
  pennylane_synced_at: string | null
  facture_url: string | null
  bon_livraison_url: string | null
  lettre_voiture_url: string | null
  sync_pending: boolean
  sync_error: string | null
  notes: string | null
  /** Nombre de relances envoyées (défaut DB : 0) */
  relance_count: number
  /** Horodatage de la dernière relance envoyée */
  last_relance_at: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryRow extends Delivery {
  clients: { name: string; tariff_mode: string; tariff_rate_cts: number | null } | null
  vehicles: { label: string } | null
  team_members: { full_name: string } | null
}

export type DeliveryInsert = Omit<
  Delivery,
  | 'id' | 'created_at' | 'updated_at'
  | 'pennylane_invoice_id' | 'pennylane_synced_at'
  | 'facture_url' | 'bon_livraison_url' | 'lettre_voiture_url'
  | 'sync_pending' | 'sync_error'
  // Colonnes legacy non inscriptibles en v2 :
  // montant_ttc_cts est GENERATED ALWAYS ; montant_ht_cts a désormais DEFAULT 0 ;
  // tva_rate a DEFAULT 20 — on ne les écrit plus, on utilise amount_* v2.
  | 'montant_ht_cts' | 'tva_rate' | 'montant_ttc_cts'
  // Gestion des relances : mise à jour via relances.queries (markRelanceSent), pas lors du create.
  | 'relance_count' | 'last_relance_at'
>

export type DeliveryUpdate = Partial<Omit<Delivery, 'id' | 'company_id' | 'created_at'>>

export interface DeliveryFilters {
  date_from?: string
  date_to?: string
  status?: DeliveryStatus | 'all'
  client_id?: string
  vehicle_id?: string
  driver_id?: string
}
