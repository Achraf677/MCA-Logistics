export interface Vehicle {
  id: string
  company_id: string
  label: string
  plate: string
  brand: string | null
  model: string | null
  year: number | null
  ptac_kg: number | null
  critair: '0' | '1' | '2' | '3' | '4' | '5' | 'NC' | null
  fuel_type: 'diesel' | 'essence' | 'electric' | 'hybrid' | 'lpg' | null
  mileage_km: number
  purchase_price_cts: number | null
  purchase_date: string | null
  status: 'active' | 'maintenance' | 'inactive'
  storage_url: string | null
  notes: string | null
  ct_expiry: string | null
  insurance_expiry: string | null
  next_revision_date: string | null
  created_at: string
  updated_at: string
}

export type VehicleInsert = Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>
export type VehicleUpdate = Partial<Omit<Vehicle, 'id' | 'company_id' | 'created_at'>>

export interface VehicleFilters {
  status?: Vehicle['status'] | 'all'
  fuel_type?: Vehicle['fuel_type'] | 'all'
  echeance?: 'urgent' | 'all'
}
