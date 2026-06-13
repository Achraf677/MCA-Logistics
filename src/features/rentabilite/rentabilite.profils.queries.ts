import { supabase } from '../../app/providers'

// Forme du JSON stocké dans cost_profiles.data
export interface ProfilData {
  version: number
  params:   Record<string, number | string>
  recettes: Array<{ id: string; label: string; freq: string; montant: number | string }>
  depenses: Array<{ id: string; label: string; freq: string; montant: number | string }>
}

export interface CostProfil {
  id:         string
  company_id: string
  name:       string
  data:       ProfilData
  created_at: string
  updated_at: string
}

const COLS = 'id, company_id, name, data, created_at, updated_at' as const

export function listProfils() {
  return supabase
    .from('cost_profiles')
    .select(COLS)
    .order('name')
}

export function createProfil(name: string, data: ProfilData, companyId: string) {
  return supabase
    .from('cost_profiles')
    .insert({ name, data, company_id: companyId })
    .select(COLS)
    .single()
}

export function updateProfil(id: string, data: ProfilData) {
  return supabase
    .from('cost_profiles')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLS)
    .single()
}

export function renameProfil(id: string, name: string) {
  return supabase
    .from('cost_profiles')
    .update({ name })
    .eq('id', id)
    .select(COLS)
    .single()
}

export function deleteProfil(id: string) {
  return supabase
    .from('cost_profiles')
    .delete()
    .eq('id', id)
}
