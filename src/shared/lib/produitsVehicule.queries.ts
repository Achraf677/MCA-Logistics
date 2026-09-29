import { supabase } from '../../app/providers'
import type { FamilleProduit, ProduitVehicule } from './produitsVehicule'
import { codeProduit } from './produitsVehicule'

export async function listProduitsVehicule(): Promise<ProduitVehicule[]> {
  const { data } = await supabase
    .from('produits_vehicule')
    .select('id, code, libelle, famille, actif')
    .order('libelle')
  return (data ?? []) as ProduitVehicule[]
}

export async function createProduitVehicule(companyId: string, libelle: string, famille: FamilleProduit) {
  return supabase.from('produits_vehicule')
    .insert({ company_id: companyId, code: codeProduit(libelle), libelle: libelle.trim(), famille })
}

/** Archivage (jamais de suppression) : les pleins passés gardent leur produit. */
export async function setProduitActif(id: string, actif: boolean) {
  return supabase.from('produits_vehicule').update({ actif }).eq('id', id)
}
