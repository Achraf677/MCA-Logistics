import type { Carburant, FuelLogRow, FuelType, Liquide } from './carburant.types'

export const CARBURANTS: Carburant[] = ['diesel', 'essence', 'electric', 'hybrid', 'lpg']
export const LIQUIDES: Liquide[] = [
  'adblue', 'lave_glace', 'huile_moteur', 'liquide_refroidissement', 'liquide_frein', 'autre_liquide',
]

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
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
  autre_liquide:           'Autre liquide',
}

export const FUEL_TYPE_COLOR: Record<FuelType, 'muted' | 'info' | 'success' | 'warning'> = {
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

/**
 * Carburant ou liquide ? Un produit inconnu (null) est traité comme un
 * carburant : c'est ce qu'étaient toutes les lignes avant l'ajout des liquides.
 */
export function estLiquide(type: FuelType | null | undefined): boolean {
  return type != null && (LIQUIDES as string[]).includes(type)
}

/** Filtre « Tout / Carburants / Liquides » — appliqué côté client. */
export function filtrerFamille(rows: FuelLogRow[], famille: 'all' | 'carburant' | 'liquide' | undefined): FuelLogRow[] {
  if (!famille || famille === 'all') return rows
  return rows.filter(r => (famille === 'liquide') === estLiquide(r.fuel_type))
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
export function kpiSummary(rows: FuelLogRow[]) {
  const totalCts = rows.reduce((s, r) => s + r.total_cts, 0)
  const carburants = rows.filter(r => !estLiquide(r.fuel_type))
  const totalLiters = carburants.reduce((s, r) => s + r.liters, 0)
  // Moyenne pondérée en millièmes → reste en millièmes pour formatPricePerLiter
  const avgPricePerLiter = totalLiters > 0
    ? carburants.reduce((s, r) => s + r.price_per_liter_milli * r.liters, 0) / totalLiters
    : 0
  return { totalCts, totalLiters, avgPricePerLiter, nb: rows.length }
}
