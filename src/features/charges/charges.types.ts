export type { ChargeCategoryRow } from '../../shared/types/categories'

export interface Charge {
  id: string
  company_id: string
  supplier_id: string | null
  date: string
  label: string
  category_id: string | null
  montant_ht_cts: number
  tva_rate: number
  tva_cts: number | null
  montant_ttc_cts: number | null
  pennylane_id: string | null
  pennylane_synced_at: string | null
  receipt_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChargeRow extends Charge {
  suppliers: { name: string } | null
  charge_categories: import('../../shared/types/categories').ChargeCategoryRow | null
}

export type ChargeInsert = Omit<Charge, 'id' | 'created_at' | 'updated_at' | 'pennylane_id' | 'pennylane_synced_at'>
export type ChargeUpdate = Partial<Omit<Charge, 'id' | 'company_id' | 'created_at'>>

export interface ChargeFilters {
  category_id?: string | 'all'
  date_from?: string
  date_to?: string
}
