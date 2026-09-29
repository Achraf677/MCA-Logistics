import {
  LIBELLE_FAMILLE_PLURIEL, produitsEffectifs, type FamilleProduit, type ProduitVehicule,
} from '../../shared/lib/produitsVehicule'

/**
 * Options d'un <select> « Produit », groupées Carburants / Consommables :
 * la liste gérée dans Paramètres (produits de base renommés ou masqués +
 * produits ajoutés). Un produit masqué reste proposé s'il est la valeur
 * courante, pour ne jamais vider un plein existant.
 */
export function OptionsProduit({ produits, valeur }: { produits: ProduitVehicule[]; valeur?: string | null }) {
  const visibles = produitsEffectifs(produits).filter(p => p.actif || p.code === valeur)
  const groupe = (famille: FamilleProduit) => (
    <optgroup label={LIBELLE_FAMILLE_PLURIEL[famille]}>
      {visibles.filter(p => p.famille === famille).map(p => <option key={p.code} value={p.code}>{p.libelle}</option>)}
    </optgroup>
  )
  return <>{groupe('carburant')}{groupe('liquide')}</>
}
