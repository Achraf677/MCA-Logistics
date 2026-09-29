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

/** Renomme une catégorie (le slug, qui route le rapprochement, ne change pas). */
export async function renameCategory(id: string, name: string) {
  return supabase.from('charge_categories').update({ name: name.trim() }).eq('id', id)
}

/** Masque / réaffiche une catégorie dans les listes de choix. */
export async function setCategoryActif(id: string, actif: boolean) {
  return supabase.from('charge_categories').update({ actif }).eq('id', id)
}

/** Supprime une catégorie personnalisée (échoue si is_system=true ou charges liées). */
export async function deleteCategory(id: string) {
  return supabase.from('charge_categories').delete().eq('id', id)
}

// categoryColor est pur : il vit dans categories.ts et n'est ré-exporté ici que
// pour les appelants existants. Ne jamais l'importer depuis un *.logic.ts —
// ce module charge le client Supabase, ce qui casse les tests purs.
export { categoryColor } from './categories'

export type { ChargeCategoryRow, ChargeCategoryWithCount }
