// Modèle de course récurrent — miroir de la table delivery_templates.
// Montants en CENTIMES (amount_ht_cts). tva_rate en POURCENTAGE (ex. 20).
export interface DeliveryTemplate {
  id: string
  company_id: string
  label: string
  client_id: string | null
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  amount_ht_cts: number | null
  tva_rate: number | null
  type: string | null
  weight_kg: number | null
  km: number | null
  empty_km: number | null
  vehicle_id: string | null
  driver_id: string | null
  created_at: string
  updated_at: string
  // joined
  clients?: { name: string } | null
}
