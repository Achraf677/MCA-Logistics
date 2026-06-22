export type FuelType = 'diesel' | 'essence' | 'electric' | 'hybrid' | 'lpg'

export interface FuelLog {
  id: string
  company_id: string
  vehicle_id: string
  driver_id: string | null
  date: string
  liters: number
  price_per_liter_cts: number
  total_cts: number
  fuel_type: FuelType | null
  mileage_km: number | null
  station: string | null
  tva_rate: number
  tva_deductible_pct: number
  tva_cts: number | null
  receipt_url: string | null
  supplier_id: string | null
  charge_id: string | null
  created_at: string
  updated_at: string
}

export interface FuelLogRow extends FuelLog {
  vehicles: { label: string; plate: string } | null
  team_members: { full_name: string } | null
  charges: { id: string; label: string; montant_ttc_cts: number | null; receipt_url: string | null } | null
}

// charge_id optionnel : les pleins manuels (sans rapprochement) ne l'incluent pas
export type FuelLogInsert = Omit<FuelLog, 'id' | 'created_at' | 'updated_at' | 'tva_cts' | 'charge_id'> & { charge_id?: string | null }
export type FuelLogUpdate = Partial<Omit<FuelLog, 'id' | 'company_id' | 'created_at' | 'tva_cts'>>

export interface FuelFilters {
  vehicle_id?: string | 'all'
  date_from?: string
  date_to?: string
}

// Type minimal pour le sélecteur de charge (sans import cross-feature)
export interface ChargePick {
  id: string
  date: string
  label: string
  montant_ht_cts: number
  montant_ttc_cts: number | null
  tva_cts: number | null
  tva_rate: number
  receipt_url: string | null
  supplier_id: string | null
  category: string | null
  suppliers: { name: string } | null
}
