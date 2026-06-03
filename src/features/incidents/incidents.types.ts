export type IncidentType = 'accident' | 'panne' | 'vol' | 'vandalisme' | 'infraction' | 'autre'
export type IncidentStatus = 'ouvert' | 'en_cours' | 'clos'

export interface Incident {
  id: string
  company_id: string
  vehicle_id: string | null
  driver_id: string | null
  date: string
  type: IncidentType | null
  description: string | null
  location: string | null
  damage_cts: number | null
  at_fault: boolean | null
  status: IncidentStatus
  police_report: boolean
  insurance_ref: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface IncidentRow extends Incident {
  vehicles: { label: string; plate: string } | null
  team_members: { full_name: string } | null
}

export type IncidentInsert = Omit<Incident, 'id' | 'created_at' | 'updated_at'>
export type IncidentUpdate = Partial<Omit<Incident, 'id' | 'company_id' | 'created_at'>>

export interface IncidentFilters {
  type?: IncidentType | 'all'
  status?: IncidentStatus | 'all'
  date_from?: string
  date_to?: string
}
