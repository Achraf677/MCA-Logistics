export interface TeamMember {
  id: string
  company_id: string
  profile_id: string | null
  full_name: string
  role: 'president' | 'dg' | 'chauffeur' | 'comptable' | null
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
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
  /** Payé au colis (lot S1) : tarif domicile / point relais, en centimes. */
  tarif_domicile_cts?: number | null
  tarif_relais_cts?: number | null
  /** Clients de messagerie du salarié, fixés par l'admin. */
  clients_messagerie?: string[]
  /** Fiche (24/10/2026) : adresse, contact d'urgence, notes — lus par le bureau seulement (Mes courses liste ses colonnes). */
  adresse?: string | null
  contact_urgence_nom?: string | null
  contact_urgence_tel?: string | null
  notes?: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type TeamMemberInsert = Omit<TeamMember, 'id' | 'created_at' | 'updated_at'>
export type TeamMemberUpdate = Partial<Omit<TeamMember, 'id' | 'company_id' | 'created_at'>>

export interface TeamFilters {
  role?: TeamMember['role'] | 'all'
  contract_type?: TeamMember['contract_type'] | 'all'
  active?: boolean
  echeance?: 'urgent' | 'all'
}
