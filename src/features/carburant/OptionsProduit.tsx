import { CARBURANTS, FUEL_TYPE_LABELS, LIQUIDES } from './carburant.logic'
import type { ProduitVehicule } from '../../shared/lib/produitsVehicule'

/**
 * Options groupées Carburants / Liquides d'un <select> « Produit » : produits
 * de base + produits personnalisés actifs (Paramètres). Un produit archivé
 * reste listé s'il est la valeur courante, pour ne pas vider un plein existant.
 */
export function OptionsProduit({ produits, valeur }: { produits: ProduitVehicule[]; valeur?: string | null }) {
  const visibles = produits.filter(p => p.actif || p.code === valeur)
  const perso = (famille: 'carburant' | 'liquide') => visibles
    .filter(p => p.famille === famille)
    .map(p => <option key={p.code} value={p.code}>{p.libelle}</option>)
  return (
    <>
      <optgroup label="Carburants">
        {CARBURANTS.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}
        {perso('carburant')}
      </optgroup>
      <optgroup label="Liquides">
        {LIQUIDES.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}
        {perso('liquide')}
      </optgroup>
    </>
  )
}
