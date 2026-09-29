import { supabase } from '../../app/providers'
import type { FamilleProduit, ProduitVehicule } from './produitsVehicule'
import { codeProduit } from './produitsVehicule'

export async function listProduitsVehicule(): Promise<ProduitVehicule[]> {
  const { data } = await supabase
    .from('produits_vehicule')
    .select('id, code, libelle, famille, actif')
  return (data ?? []) as ProduitVehicule[]
}

/** Nouveau produit personnalisé. */
export async function createProduitVehicule(companyId: string, libelle: string, famille: FamilleProduit) {
  return supabase.from('produits_vehicule')
    .insert({ company_id: companyId, code: codeProduit(libelle), libelle: libelle.trim(), famille })
}

/**
 * Renommer / masquer / réafficher un produit, de base ou personnalisé : une
 * ligne par (société, code), créée au premier changement d'un produit de base.
 */
export async function enregistrerProduit(
  companyId: string,
  p: { code: string; libelle: string; famille: FamilleProduit; actif: boolean },
) {
  return supabase.from('produits_vehicule').upsert(
    { company_id: companyId, code: p.code, libelle: p.libelle.trim(), famille: p.famille, actif: p.actif },
    { onConflict: 'company_id,code' },
  )
}
