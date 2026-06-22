export type MaintenanceType =
  | 'vidange' | 'pneus' | 'freins' | 'controle_technique'
  | 'revision' | 'reparation' | 'inspection' | 'autre'

export interface Maintenance {
  id: string
  company_id: string
  vehicle_id: string
  date: string
  type: MaintenanceType | null
  description: string | null
  mileage_km: number | null
  cost_cts: number | null
  supplier_id: string | null
  next_due_date: string | null
  next_due_km: number | null
  receipt_url: string | null
  notes: string | null
  charge_id: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceRow extends Maintenance {
  vehicles: { label: string; plate: string } | null
  suppliers: { name: string } | null
  charges: { id: string; label: string; montant_ttc_cts: number | null; receipt_url: string | null; pennylane_id: string | null } | null
}

export type MaintenanceInsert = Omit<Maintenance, 'id' | 'created_at' | 'updated_at'>
export type MaintenanceUpdate = Partial<Omit<Maintenance, 'id' | 'company_id' | 'created_at'>>

export interface MaintenanceFilters {
  vehicle_id?: string | 'all'
  type?: MaintenanceType | 'all'
  date_from?: string
  date_to?: string
}
