import { supabase } from '../../app/providers'
import { slugifyCategoryName } from './categories'
import type { ChargeCategoryRow, ChargeCategoryWithCount } from '../types/categories'

/** Retourne les catégories de la société, avec le nombre de charges liées. */
export async function getCategories(companyId: string): Promise<ChargeCategoryWithCount[]> {
  const { data } = await supabase
    .from('charge_categories')
    .select('*, charges(count)')
    .eq('company_id', companyId)
    .order('is_system', { ascending: false })
    .order('name')
  return (data ?? []) as unknown as ChargeCategoryWithCount[]
}

/** Crée une catégorie personnalisée. `type` route le rapprochement (ex :
 *  'entretien', 'carburant') — optionnel, null par défaut (catégorie générique). */
export async function createCategory(companyId: string, name: string, type: string | null = null) {
  const slug = slugifyCategoryName(name)
  return supabase
    .from('charge_categories')
    .insert({ company_id: companyId, name: name.trim(), slug, type, is_system: false })
    .select()
    .single()
}

/** Supprime une catégorie personnalisée (échoue si is_system=true ou charges liées). */
export async function deleteCategory(id: string) {
  return supabase.from('charge_categories').delete().eq('id', id)
}

/** Couleur de badge selon le slug. Fallback 'muted' pour les catégories perso. */
export function categoryColor(slug: string): 'muted' | 'info' | 'warning' | 'danger' | 'success' {
  const map: Record<string, 'muted' | 'info' | 'warning' | 'danger' | 'success'> = {
    carburant:       'warning',
    assurance:       'info',
    entretien:       'warning',
    salaire:         'danger',
    logiciel:        'muted',
    telecom:         'muted',
    loyer:           'muted',
    frais_bancaires: 'muted',
    comptabilite:    'muted',
    publicite:       'muted',
    autre:           'muted',
  }
  return map[slug] ?? 'muted'
}

export type { ChargeCategoryRow, ChargeCategoryWithCount }
