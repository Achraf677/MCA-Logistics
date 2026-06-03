export type InspectionType   = 'pre_trajet' | 'post_trajet' | 'periodique'
export type InspectionStatus = 'ok' | 'defauts' | 'refuse'

export interface Inspection {
  id: string
  company_id: string
  vehicle_id: string
  driver_id: string | null
  date: string
  type: InspectionType | null
  mileage_km: number | null
  exterior_ok: boolean
  lights_ok: boolean
  tires_ok: boolean
  brakes_ok: boolean
  fluids_ok: boolean
  docs_ok: boolean
  cleanliness_ok: boolean
  status: InspectionStatus
  defects: string | null
  notes: string | null
  signed_by: string | null
  created_at: string
  updated_at: string
}

export interface InspectionRow extends Inspection {
  vehicles: { label: string; plate: string } | null
  team_members: { full_name: string } | null
}

export type InspectionInsert = Omit<Inspection, 'id' | 'created_at' | 'updated_at'>
export type InspectionUpdate = Partial<Omit<Inspection, 'id' | 'company_id' | 'created_at'>>

export interface InspectionFilters {
  vehicle_id?: string | 'all'
  status?: InspectionStatus | 'all'
  type?: InspectionType | 'all'
  date_from?: string
  date_to?: string
}
