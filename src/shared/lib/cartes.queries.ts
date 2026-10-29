import { supabase } from '../../app/providers'
import type { CarteBancaire, SaisieCarte, TypeCarte, UsageCarte } from './cartes'

const COLS = 'id, code, nom, fin, type, actif_a_partir_du, inactif_a_partir_du'

export async function listerCartes() {
  return supabase.from('cartes_bancaires').select(COLS).order('nom').order('fin').returns<CarteBancaire[]>()
}

const versBase = (s: SaisieCarte) => ({
  nom: s.nom.trim().toUpperCase(),
  fin: s.fin.trim().toUpperCase(),
  actif_a_partir_du: s.actif_a_partir_du || null,
  inactif_a_partir_du: s.inactif_a_partir_du || null,
})

export async function creerCarte(companyId: string, code: string, type: TypeCarte, s: SaisieCarte) {
  const { error } = await supabase.from('cartes_bancaires').insert({ company_id: companyId, code, type, ...versBase(s) })
  return { error: error ? new Error(error.message) : null }
}

/** Le type et le code ne changent jamais ici (les justificatifs déjà classés s'y réfèrent). */
export async function modifierCarte(id: string, s: SaisieCarte) {
  const { data, error } = await supabase.from('cartes_bancaires').update(versBase(s)).eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Modification refusée : droit insuffisant.') }
  return { error: null }
}

export async function supprimerCarte(id: string) {
  const { data, error } = await supabase.from('cartes_bancaires').delete().eq('id', id).select('id')
  if (error) {
    // Clé étrangère : la carte porte déjà des justificatifs ou des pleins.
    return { error: new Error(error.code === '23503' ? 'Cette carte est déjà utilisée : rends-la inactive plutôt que de la supprimer.' : error.message) }
  }
  if (!data || data.length === 0) return { error: new Error('Suppression refusée : droit insuffisant.') }
  return { error: null }
}

/** Combien de justificatifs et de pleins portent chaque carte (par code). */
export async function usageCartes(): Promise<Record<string, UsageCarte>> {
  const [r, p] = await Promise.all([
    supabase.from('receipts_inbox').select('carte').not('carte', 'is', null).limit(5000),
    supabase.from('pleins_carburant').select('carte').not('carte', 'is', null).limit(5000),
  ])
  const out: Record<string, UsageCarte> = {}
  for (const row of (r.data ?? []) as Array<{ carte: string }>) (out[row.carte] ??= { justificatifs: 0, pleins: 0 }).justificatifs += 1
  for (const row of (p.data ?? []) as Array<{ carte: string }>) (out[row.carte] ??= { justificatifs: 0, pleins: 0 }).pleins += 1
  return out
}
