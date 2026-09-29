// Produits personnalisés de « Carburant & liquides » — PUR (sans DB ni DOM).
// Partagé : Paramètres les crée, Carburant les affiche et les compte.

export type FamilleProduit = 'carburant' | 'liquide'

export interface ProduitVehicule {
  id: string
  code: string
  libelle: string
  famille: FamilleProduit
  actif: boolean
}

/** Code stable d'un produit personnalisé : « x_ » + libellé normalisé. */
export function codeProduit(libelle: string): string {
  const base = libelle
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `x_${base || 'produit'}`
}

export function estCodePersonnalise(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.startsWith('x_')
}
