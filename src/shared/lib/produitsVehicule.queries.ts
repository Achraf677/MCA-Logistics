import { supabase } from '../../app/providers'
import type { FamilleProduit, ProduitVehicule, ReglagesArticle } from './produitsVehicule'
import { codeProduit, PRODUITS_BASE } from './produitsVehicule'

export async function listProduitsVehicule(): Promise<ProduitVehicule[]> {
  const { data } = await supabase
    .from('produits_vehicule')
    .select('id, code, libelle, famille, actif, supprime, unite, stockable, periodicite_km, periodicite_mois, seuil_stock')
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
  p: { code: string; libelle: string; famille: FamilleProduit; actif: boolean; reglages: ReglagesArticle },
) {
  return supabase.from('produits_vehicule').upsert(
    {
      company_id: companyId, code: p.code, libelle: p.libelle.trim(), famille: p.famille, actif: p.actif,
      unite: p.reglages.unite, stockable: p.reglages.stockable,
      periodicite_km: p.reglages.periodiciteKm, periodicite_mois: p.reglages.periodiciteMois,
      seuil_stock: p.reglages.seuilStock,
    },
    { onConflict: 'company_id,code' },
  )
}

/**
 * Supprime un produit INUTILISÉ (l'appelant vérifie qu'aucun plein ne l'utilise).
 * Produit de base : surcharge « supprime » (il vit dans le code). Produit
 * personnalisé : suppression réelle de la ligne.
 */
export async function supprimerProduit(
  companyId: string,
  p: { code: string; libelle: string; famille: FamilleProduit },
) {
  if (PRODUITS_BASE.some(b => b.code === p.code)) {
    return supabase.from('produits_vehicule').upsert(
      { company_id: companyId, code: p.code, libelle: p.libelle, famille: p.famille, actif: false, supprime: true },
      { onConflict: 'company_id,code' },
    )
  }
  return supabase.from('produits_vehicule').delete().eq('company_id', companyId).eq('code', p.code)
}

/** Remet dans la liste tous les produits de base supprimés. */
export async function restaurerProduitsBase(companyId: string) {
  return supabase.from('produits_vehicule')
    .update({ supprime: false, actif: true })
    .eq('company_id', companyId).eq('supprime', true)
}

/** Nombre de lignes Carburant & consommables par produit (pour autoriser la suppression). */
export async function compterUsagesProduits(): Promise<Map<string, number>> {
  const { data } = await supabase.from('fuel_logs').select('fuel_type').not('fuel_type', 'is', null)
  const nb = new Map<string, number>()
  for (const r of (data ?? []) as { fuel_type: string }[]) nb.set(r.fuel_type, (nb.get(r.fuel_type) ?? 0) + 1)
  return nb
}
