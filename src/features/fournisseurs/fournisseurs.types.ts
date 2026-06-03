export interface Supplier {
  id: string
  company_id: string
  name: string
  siret: string | null
  tva_intra: string | null
  address: string | null
  email: string | null
  phone: string | null
  category: 'carburant' | 'assurance' | 'entretien' | 'soustraitance' | 'logiciel' | 'telecom' | 'autre' | null
  pennylane_id: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type SupplierInsert = Omit<Supplier, 'id' | 'created_at' | 'updated_at'>
export type SupplierUpdate = Partial<Omit<Supplier, 'id' | 'company_id' | 'created_at'>>

export interface SupplierFilters {
  category?: Supplier['category'] | 'all'
  active?: boolean
  search?: string
}
