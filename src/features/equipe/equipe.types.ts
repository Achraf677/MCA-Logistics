export interface TeamMember {
  id: string
  company_id: string
  profile_id: string | null
  full_name: string
  role_label: string | null
  idcc: string
  coefficient: number | null
  contract_type: 'cdi' | 'cdd' | 'interim' | 'associe' | null
  salary_gross_cts: number | null
  start_date: string | null
  end_date: string | null
  phone: string | null
  email: string | null
  license_type: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type TeamMemberInsert = Omit<TeamMember, 'id' | 'created_at' | 'updated_at'>
export type TeamMemberUpdate = Partial<Omit<TeamMember, 'id' | 'company_id' | 'created_at'>>

export interface TeamFilters {
  contract_type?: TeamMember['contract_type'] | 'all'
  active?: boolean
}
