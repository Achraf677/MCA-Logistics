import { supabase } from '../../app/providers'

/** Plein saisi à la main par le bureau, sans justificatif (table `pleins_carburant`, migration 20261029110000). */
export interface PleinManuel {
  id: string
  company_id: string
  vehicle_id: string
  date_plein: string
  montant_ttc_cts: number
  carte: string | null
  note: string | null
  created_at: string
}

export interface SaisiePlein {
  vehicle_id: string
  date_plein: string
  montant_ttc_cts: number
  carte: string | null
  note: string | null
}

export async function listerPleinsManuels(limite = 1000) {
  return supabase.from('pleins_carburant').select('*').order('date_plein', { ascending: false }).limit(limite).returns<PleinManuel[]>()
}

export async function creerPleinManuel(companyId: string, s: SaisiePlein) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('pleins_carburant').insert({ ...s, company_id: companyId, created_by: user?.id ?? null })
  return { error: error ? new Error(error.message) : null }
}

export async function modifierPleinManuel(id: string, s: SaisiePlein) {
  const { data, error } = await supabase.from('pleins_carburant').update(s).eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Modification refusée : droit insuffisant.') }
  return { error: null }
}

export async function supprimerPleinManuel(id: string) {
  const { data, error } = await supabase.from('pleins_carburant').delete().eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Suppression refusée : droit insuffisant.') }
  return { error: null }
}
