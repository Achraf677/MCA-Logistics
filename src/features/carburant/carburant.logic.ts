import type { Carburant, FuelLogRow, FuelType, Liquide } from './carburant.types'
import { produitsEffectifs, type ProduitVehicule } from '../../shared/lib/produitsVehicule'

export const CARBURANTS: Carburant[] = ['diesel', 'essence', 'electric', 'hybrid', 'lpg']
export const LIQUIDES: Liquide[] = [
  'adblue', 'lave_glace', 'huile_moteur', 'liquide_refroidissement', 'liquide_frein', 'autre_liquide',
]

export const FUEL_TYPE_LABELS: Record<Carburant | Liquide, string> = {
  diesel:   'Diesel',
  essence:  'Essence',
  electric: 'Électrique',
  hybrid:   'Hybride',
  lpg:      'GPL',
  adblue:                  'AdBlue',
  lave_glace:              'Lave-glace',
  huile_moteur:            'Huile moteur',
  liquide_refroidissement: 'Liquide de refroidissement',
  liquide_frein:           'Liquide de frein',
  autre_liquide:           'Autre consommable',
}

export const FUEL_TYPE_COLOR: Record<Carburant | Liquide, 'muted' | 'info' | 'success' | 'warning'> = {
  diesel:   'muted',
  essence:  'warning',
  electric: 'success',
  hybrid:   'info',
  lpg:      'warning',
  adblue:                  'info',
  lave_glace:              'info',
  huile_moteur:            'info',
  liquide_refroidissement: 'info',
  liquide_frein:           'info',
  autre_liquide:           'info',
}

/** Libellé d'un produit, tel que nommé dans Paramètres (renommage compris). */
export function libelleProduit(code: FuelType | null | undefined, produits: ProduitVehicule[] = []): string {
  if (!code) return '—'
  return produitsEffectifs(produits).find(p => p.code === code)?.libelle ?? code
}

export function couleurProduit(code: FuelType | null | undefined): 'muted' | 'info' | 'success' | 'warning' {
  return (code && (FUEL_TYPE_COLOR as Record<string, 'muted' | 'info' | 'success' | 'warning'>)[code]) || 'info'
}

/**
 * Consommable (AdBlue, lave-glace, huile…) plutôt que carburant ? Un produit
 * absent (null) est un carburant : c'est ce qu'étaient toutes les lignes avant
 * l'ajout des consommables. Un produit personnalisé suit sa famille.
 */
export function estLiquide(type: FuelType | null | undefined, produits: ProduitVehicule[] = []): boolean {
  if (type == null) return false
  if ((LIQUIDES as string[]).includes(type)) return true
  return produits.find(p => p.code === type)?.famille === 'liquide'
}

/**
 * Filtre de la liste, côté client : `'all'`, une famille (`'famille:carburant'`,
 * `'famille:liquide'`) ou un produit précis (son code, ex. `'adblue'`).
 */
export function filtrerProduit(
  rows: FuelLogRow[], filtre: string | undefined, produits: ProduitVehicule[] = [],
): FuelLogRow[] {
  if (!filtre || filtre === 'all') return rows
  if (filtre === 'famille:carburant') return rows.filter(r => !estLiquide(r.fuel_type, produits))
  if (filtre === 'famille:liquide') return rows.filter(r => estLiquide(r.fuel_type, produits))
  return rows.filter(r => r.fuel_type === filtre)
}

/** Produits réellement présents dans la liste, du plus fréquent au plus rare (puces de filtre). */
export function produitsUtilises(rows: FuelLogRow[]): Array<{ code: FuelType; nb: number }> {
  const nb = new Map<FuelType, number>()
  for (const r of rows) if (r.fuel_type) nb.set(r.fuel_type, (nb.get(r.fuel_type) ?? 0) + 1)
  return [...nb.entries()].map(([code, n]) => ({ code, nb: n })).sort((a, b) => b.nb - a.nb)
}

export { formatCents } from '../../shared/lib/money'

export function formatLiters(liters: number): string {
  return liters.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' L'
}

export function formatPricePerLiter(milli: number): string {
  return (milli / 1000).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }) + ' €/L'
}

/**
 * KPIs de la liste. Le TOTAL couvre tout (carburants + liquides : c'est ce que
 * coûte le véhicule). Les LITRES et le PRIX MOYEN AU LITRE, eux, ne portent que
 * sur les carburants : 10 L d'AdBlue à 1,49 €/L feraient mentir le prix moyen
 * du gazole et la consommation.
 */
export function kpiSummary(rows: FuelLogRow[], produits: ProduitVehicule[] = []) {
  const totalCts = rows.reduce((s, r) => s + r.total_cts, 0)
  const carburants = rows.filter(r => !estLiquide(r.fuel_type, produits))
  const totalLiters = carburants.reduce((s, r) => s + r.liters, 0)
  // Moyenne pondérée en millièmes → reste en millièmes pour formatPricePerLiter
  const avgPricePerLiter = totalLiters > 0
    ? carburants.reduce((s, r) => s + r.price_per_liter_milli * r.liters, 0) / totalLiters
    : 0
  return { totalCts, totalLiters, avgPricePerLiter, nb: rows.length }
}
