export type DeliveryStatus = 'brouillon' | 'validee' | 'facturee' | 'payee' | 'annulee'
export type DeliveryType = 'medical' | 'ecommerce' | 'retail' | 'particulier'

export interface Delivery {
  id: string
  company_id: string
  client_id: string
  vehicle_id: string | null
  driver_id: string | null
  date: string
  type: DeliveryType | null
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  km: number | null
  weight_kg: number | null
  montant_ht_cts: number
  tva_rate: number
  montant_ttc_cts: number
  statut: DeliveryStatus
  pennylane_invoice_id: string | null
  pennylane_synced_at: string | null
  facture_url: string | null
  bon_livraison_url: string | null
  lettre_voiture_url: string | null
  sync_pending: boolean
  sync_error: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Shape returned by Supabase with PostgREST joins
export interface DeliveryRow extends Delivery {
  clients: { name: string } | null
  vehicles: { label: string } | null
  team_members: { full_name: string } | null
}

export type DeliveryInsert = Omit<
  Delivery,
  | 'id' | 'created_at' | 'updated_at' | 'montant_ttc_cts'
  | 'pennylane_invoice_id' | 'pennylane_synced_at'
  | 'facture_url' | 'bon_livraison_url' | 'lettre_voiture_url'
  | 'sync_pending' | 'sync_error'
>

export type DeliveryUpdate = Partial<Omit<Delivery, 'id' | 'company_id' | 'created_at' | 'montant_ttc_cts'>>

export interface DeliveryFilters {
  date_from?: string
  date_to?: string
  statut?: DeliveryStatus | 'all'
  type?: DeliveryType | 'all'
}
