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
  transport_license_expiry: string | null
  rc_pro_expiry: string | null
  /** Numéro de licence DREAL — mention obligatoire lettre de voiture. */
  licence_transport: string | null
}

export async function getCompany(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, siren, siret, tva_intra, address, depot_lat, depot_lng, capital_cts, iban, bic, transport_license_expiry, rc_pro_expiry, licence_transport')
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
