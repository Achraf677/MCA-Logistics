// Produits de « Carburant & consommables » — PUR (sans DB ni DOM).
// Partagé : Paramètres les gère, Carburant les affiche et les compte.
//
// Une seule liste pour l'utilisateur : les produits DE BASE (définis ici) et
// ses produits PERSONNALISÉS (table produits_vehicule, code « x_… »). Une ligne
// de la table portant le code d'un produit de base le SURCHARGE : libellé
// renommé, ou produit masqué (actif = false). Rien n'est jamais supprimé : les
// pleins passés gardent leur produit.

/** Famille technique. « liquide » est le code stocké ; l'écran dit « Consommable ». */
export type FamilleProduit = 'carburant' | 'liquide'

export const LIBELLE_FAMILLE: Record<FamilleProduit, string> = {
  carburant: 'Carburant',
  liquide: 'Consommable',
}
export const LIBELLE_FAMILLE_PLURIEL: Record<FamilleProduit, string> = {
  carburant: 'Carburants',
  liquide: 'Consommables',
}

/** Ligne de la table produits_vehicule (personnalisé ou surcharge d'un produit de base). */
export interface ProduitVehicule {
  id: string
  code: string
  libelle: string
  famille: FamilleProduit
  actif: boolean
}

/** Produit tel que l'écran l'utilise, après fusion base + table. */
export interface ProduitEffectif {
  code: string
  libelle: string
  famille: FamilleProduit
  actif: boolean
  /** Produit de base (non supprimable, renommable, masquable). */
  base: boolean
}

export const PRODUITS_BASE: ReadonlyArray<{ code: string; libelle: string; famille: FamilleProduit }> = [
  { code: 'diesel',                  libelle: 'Diesel',                     famille: 'carburant' },
  { code: 'essence',                 libelle: 'Essence',                    famille: 'carburant' },
  { code: 'electric',                libelle: 'Électrique',                 famille: 'carburant' },
  { code: 'hybrid',                  libelle: 'Hybride',                    famille: 'carburant' },
  { code: 'lpg',                     libelle: 'GPL',                        famille: 'carburant' },
  { code: 'adblue',                  libelle: 'AdBlue',                     famille: 'liquide' },
  { code: 'lave_glace',              libelle: 'Lave-glace',                 famille: 'liquide' },
  { code: 'huile_moteur',            libelle: 'Huile moteur',               famille: 'liquide' },
  { code: 'liquide_refroidissement', libelle: 'Liquide de refroidissement', famille: 'liquide' },
  { code: 'liquide_frein',           libelle: 'Liquide de frein',           famille: 'liquide' },
  { code: 'autre_liquide',           libelle: 'Autre consommable',          famille: 'liquide' },
]

/**
 * Liste effective : produits de base (éventuellement renommés / masqués par
 * une ligne de la table), puis produits personnalisés. Ordre : carburants
 * d'abord, puis consommables ; base avant personnalisés.
 */
export function produitsEffectifs(table: ProduitVehicule[]): ProduitEffectif[] {
  const parCode = new Map(table.map(p => [p.code, p]))
  const base: ProduitEffectif[] = PRODUITS_BASE.map(b => {
    const s = parCode.get(b.code)
    return { code: b.code, famille: b.famille, libelle: s?.libelle?.trim() || b.libelle, actif: s ? s.actif : true, base: true }
  })
  const codesBase = new Set(PRODUITS_BASE.map(b => b.code))
  const perso: ProduitEffectif[] = table
    .filter(p => !codesBase.has(p.code))
    .map(p => ({ code: p.code, libelle: p.libelle, famille: p.famille, actif: p.actif, base: false }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  const ordre = (f: FamilleProduit) => (f === 'carburant' ? 0 : 1)
  return [...base, ...perso].sort((a, b) => ordre(a.famille) - ordre(b.famille))
}

/** Code stable d'un produit personnalisé : « x_ » + libellé normalisé. */
export function codeProduit(libelle: string): string {
  const slug = libelle
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `x_${slug || 'produit'}`
}

export function estCodePersonnalise(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.startsWith('x_')
}
