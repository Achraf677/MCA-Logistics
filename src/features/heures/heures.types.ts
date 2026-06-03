export interface WorkHour {
  id: string
  company_id: string
  member_id: string
  date: string
  start_time: string | null
  end_time: string | null
  break_minutes: number
  total_minutes: number | null
  delivery_id: string | null
  notes: string | null
  created_at: string
}

export interface WorkHourRow extends WorkHour {
  team_members: { full_name: string } | null
  deliveries: { clients: { name: string } | null } | null
}

export type WorkHourInsert = Omit<WorkHour, 'id' | 'created_at' | 'total_minutes'>
export type WorkHourUpdate = Partial<Omit<WorkHour, 'id' | 'company_id' | 'created_at' | 'total_minutes'>>

export interface WorkHourFilters {
  member_id?: string | 'all'
  date_from?: string
  date_to?: string
}
