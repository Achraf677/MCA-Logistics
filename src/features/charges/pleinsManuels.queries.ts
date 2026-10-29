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
  /** Litres × prix au litre = montant TTC (colonnes `litres`, `prix_litre`, migration 20261029120000). */
  litres: number | null
  prix_litre: number | null
  /** Qui a fait le plein (fiche Équipe), migration 20261029130000. */
  fait_par: string | null
  created_at: string
}

export interface SaisiePlein {
  vehicle_id: string
  date_plein: string
  montant_ttc_cts: number
  carte: string | null
  note: string | null
  litres: number
  prix_litre: number
  fait_par: string
}

/** Membres actifs de l'équipe : « qui a fait le plein ». */
export async function membresPourPlein() {
  const { data } = await supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
  return (data ?? []) as Array<{ id: string; full_name: string }>
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
