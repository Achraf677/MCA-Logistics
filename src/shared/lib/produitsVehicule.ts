// ARTICLES des dépenses véhicule (plan : mca-spec/tabs/30-depenses-vehicule.md)
// — PUR (sans DB ni DOM). Partagé : Paramètres les gère (« Articles & familles »),
// Carburant & consommables / Entretien & équipement les affichent et les comptent.
//
// Une seule liste pour l'utilisateur : les produits DE BASE (définis ici) et
// ses produits PERSONNALISÉS (table produits_vehicule, code « x_… »). Une ligne
// de la table portant le code d'un produit de base le SURCHARGE : libellé
// renommé, ou produit masqué (actif = false). Rien n'est jamais supprimé : les
// pleins passés gardent leur produit.

/**
 * Les 4 familles. « liquide » est le code stocké des consommables (historique :
 * la colonne existait avant le renommage) ; l'écran dit toujours « Consommable ».
 */
export type FamilleProduit = 'carburant' | 'liquide' | 'entretien' | 'equipement'

export const FAMILLES: FamilleProduit[] = ['carburant', 'liquide', 'entretien', 'equipement']

export const LIBELLE_FAMILLE: Record<FamilleProduit, string> = {
  carburant: 'Carburant',
  liquide: 'Consommable',
  entretien: 'Entretien & réparation',
  equipement: 'Équipement & fourniture',
}
export const LIBELLE_FAMILLE_PLURIEL: Record<FamilleProduit, string> = {
  carburant: 'Carburants',
  liquide: 'Consommables',
  entretien: 'Entretien & réparations',
  equipement: 'Équipement & fournitures',
}

/** Unités proposées (l'unité par défaut d'un article pré-remplit la saisie). */
export const UNITES = ['L', 'bidon', 'pièce', 'lot', 'prestation'] as const
export type Unite = typeof UNITES[number]

/** Réglages d'un article (plan §8). */
export interface ReglagesArticle {
  unite: Unite
  /** Peut être acheté pour le stock (🧴 📦). Jamais pour ⛽ ni 🔧. */
  stockable: boolean
  /** 🔧 : périodicité qui déclenche la prochaine échéance (l'un, l'autre ou les deux). */
  periodiciteKm: number | null
  periodiciteMois: number | null
  /** Stockables : alerte quand la quantité en stock passe sous ce seuil. */
  seuilStock: number | null
}

/** Stockable possible selon la famille (plan §2). */
export function familleStockable(f: FamilleProduit): boolean {
  return f === 'liquide' || f === 'equipement'
}

export const REGLAGES_PAR_FAMILLE: Record<FamilleProduit, ReglagesArticle> = {
  carburant:  { unite: 'L',          stockable: false, periodiciteKm: null, periodiciteMois: null, seuilStock: null },
  liquide:    { unite: 'L',          stockable: true,  periodiciteKm: null, periodiciteMois: null, seuilStock: null },
  entretien:  { unite: 'prestation', stockable: false, periodiciteKm: null, periodiciteMois: null, seuilStock: null },
  equipement: { unite: 'pièce',      stockable: true,  periodiciteKm: null, periodiciteMois: null, seuilStock: null },
}

/** Ligne de la table produits_vehicule (personnalisé ou surcharge d'un produit de base). */
export interface ProduitVehicule {
  id: string
  code: string
  libelle: string
  famille: FamilleProduit
  actif: boolean
  /** Produit de base retiré de la liste par l'utilisateur (surcharge). */
  supprime?: boolean
  unite?: string | null
  stockable?: boolean | null
  periodicite_km?: number | null
  periodicite_mois?: number | null
  seuil_stock?: number | null
}

/** Produit tel que l'écran l'utilise, après fusion base + table. */
export interface ProduitEffectif {
  code: string
  libelle: string
  famille: FamilleProduit
  actif: boolean
  /** Produit de base (fourni d'office ; renommable, masquable, supprimable si inutilisé). */
  base: boolean
  reglages: ReglagesArticle
}

type ArticleBase = { code: string; libelle: string; famille: FamilleProduit } & Partial<ReglagesArticle>

export const PRODUITS_BASE: ReadonlyArray<ArticleBase> = [
  // ⛽ Carburants
  { code: 'diesel',                  libelle: 'Diesel',                     famille: 'carburant' },
  { code: 'essence',                 libelle: 'Essence',                    famille: 'carburant' },
  { code: 'electric',                libelle: 'Électrique',                 famille: 'carburant', unite: 'L' },
  { code: 'hybrid',                  libelle: 'Hybride',                    famille: 'carburant' },
  { code: 'lpg',                     libelle: 'GPL',                        famille: 'carburant' },
  // 🧴 Consommables
  { code: 'adblue',                  libelle: 'AdBlue',                     famille: 'liquide' },
  { code: 'lave_glace',              libelle: 'Lave-glace',                 famille: 'liquide' },
  { code: 'huile_moteur',            libelle: 'Huile moteur',               famille: 'liquide' },
  { code: 'liquide_refroidissement', libelle: 'Liquide de refroidissement', famille: 'liquide' },
  { code: 'liquide_frein',           libelle: 'Liquide de frein',           famille: 'liquide' },
  { code: 'autre_liquide',           libelle: 'Autre consommable',          famille: 'liquide' },
  // 🔧 Entretien & réparations (périodicités usuelles, modifiables dans Paramètres)
  { code: 'vidange',                 libelle: 'Vidange',                    famille: 'entretien', periodiciteKm: 30000, periodiciteMois: 12 },
  { code: 'revision',                libelle: 'Révision',                   famille: 'entretien', periodiciteKm: 30000, periodiciteMois: 12 },
  { code: 'controle_technique',      libelle: 'Contrôle technique',         famille: 'entretien', periodiciteMois: 12 },
  { code: 'pneus',                   libelle: 'Pneus',                      famille: 'entretien', unite: 'pièce' },
  { code: 'freins',                  libelle: 'Freins',                     famille: 'entretien' },
  { code: 'lavage',                  libelle: 'Lavage',                     famille: 'entretien' },
  { code: 'carrosserie',             libelle: 'Carrosserie',                famille: 'entretien' },
  { code: 'pieces',                  libelle: 'Pièces détachées',           famille: 'entretien', unite: 'pièce' },
  { code: 'main_oeuvre',             libelle: "Main-d'œuvre",               famille: 'entretien' },
  { code: 'autre_entretien',         libelle: 'Autre réparation',           famille: 'entretien' },
  // 📦 Équipement & fournitures
  { code: 'accessoire_vehicule',     libelle: 'Accessoire véhicule',        famille: 'equipement' },
  { code: 'arrimage',                libelle: 'Arrimage (sangles, filets)', famille: 'equipement', unite: 'lot' },
  { code: 'manutention',             libelle: 'Manutention (diable…)',      famille: 'equipement' },
  { code: 'outillage',               libelle: 'Outillage',                  famille: 'equipement' },
  { code: 'securite',                libelle: 'Équipement de sécurité',     famille: 'equipement' },
  { code: 'fournitures',             libelle: 'Fournitures diverses',       famille: 'equipement', unite: 'lot' },
]

/** Réglages effectifs : défaut de la famille ← défaut de l'article de base ← table. */
function reglagesDe(famille: FamilleProduit, base: Partial<ReglagesArticle> | undefined, t: ProduitVehicule | undefined): ReglagesArticle {
  const d = { ...REGLAGES_PAR_FAMILLE[famille], ...(base ?? {}) }
  const unite = (UNITES as readonly string[]).includes(t?.unite ?? '') ? (t!.unite as Unite) : d.unite
  return {
    unite,
    stockable: familleStockable(famille) && (t?.stockable ?? d.stockable),
    periodiciteKm: famille === 'entretien' ? (t ? t.periodicite_km ?? null : d.periodiciteKm) : null,
    periodiciteMois: famille === 'entretien' ? (t ? t.periodicite_mois ?? null : d.periodiciteMois) : null,
    seuilStock: familleStockable(famille) ? (t?.seuil_stock ?? d.seuilStock) : null,
  }
}

/**
 * Liste effective : produits de base (éventuellement renommés / masqués par
 * une ligne de la table, absents s'ils ont été supprimés), puis produits
 * personnalisés. Ordre des familles : ⛽ 🧴 🔧 📦 ; base avant personnalisés.
 */
export function produitsEffectifs(table: ProduitVehicule[]): ProduitEffectif[] {
  const parCode = new Map(table.map(p => [p.code, p]))
  const base: ProduitEffectif[] = PRODUITS_BASE.filter(b => !parCode.get(b.code)?.supprime).map(b => {
    const s = parCode.get(b.code)
    return {
      code: b.code, famille: b.famille, libelle: s?.libelle?.trim() || b.libelle,
      actif: s ? s.actif : true, base: true, reglages: reglagesDe(b.famille, b, s),
    }
  })
  const codesBase = new Set(PRODUITS_BASE.map(b => b.code))
  const perso: ProduitEffectif[] = table
    .filter(p => !codesBase.has(p.code))
    .map(p => ({
      code: p.code, libelle: p.libelle, famille: p.famille, actif: p.actif, base: false,
      reglages: reglagesDe(p.famille, undefined, p),
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  return [...base, ...perso].sort((a, b) => FAMILLES.indexOf(a.famille) - FAMILLES.indexOf(b.famille))
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

/** Produits de base supprimés par l'utilisateur (pour pouvoir les restaurer). */
export function produitsBaseSupprimes(table: ProduitVehicule[]): string[] {
  return table.filter(p => p.supprime && PRODUITS_BASE.some(b => b.code === p.code)).map(p => p.code)
}
