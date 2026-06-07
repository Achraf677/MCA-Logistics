import { supabase } from '../../app/providers'

export interface CompanyData {
  id: string
  name: string
  siren: string | null
  siret: string | null
  tva_intra: string | null
  address: string | null
  /** Coordonnées géocodées du dépôt (Photon). */
  depot_lat: number | null
  depot_lng: number | null
  capital_cts: number | null
  iban: string | null
  bic: string | null
}

export async function getCompany(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, siren, siret, tva_intra, address, depot_lat, depot_lng, capital_cts, iban, bic')
    .eq('id', companyId)
    .single()
}

export async function updateCompany(companyId: string, data: Partial<Omit<CompanyData, 'id'>>) {
  return supabase
    .from('companies')
    .update(data)
    .eq('id', companyId)
    .select()
    .single()
}
