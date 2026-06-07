// Logique pure des Tournées : éligibilité des livraisons, géocodage, estimation carburant.
// Aucune dépendance DB ni DOM.

import type { TourDelivery } from './tournees.types'

/** Statuts de livraison pouvant entrer dans une tournée. */
export const ELIGIBLE_STATUSES = ['planifiee', 'en_cours', 'livree'] as const

/** Coût carburant par défaut, en centimes par km (0,15 €/km). */
export const DEFAULT_FUEL_CTS_PER_KM = 15

/** Une livraison est géocodée si elle a une latitude ET une longitude. */
export function isGeocoded(d: Pick<TourDelivery, 'delivery_lat' | 'delivery_lng'>): boolean {
  return d.delivery_lat != null && d.delivery_lng != null
}

/**
 * Livraisons éligibles à l'affichage dans l'écran Tournées :
 * statut planifiee / en_cours / livree. Les non géocodées restent listées
 * (grisées côté UI), seules les géocodées sont sélectionnables.
 */
export function eligibleDeliveries(deliveries: TourDelivery[]): TourDelivery[] {
  return deliveries.filter(d =>
    (ELIGIBLE_STATUSES as readonly string[]).includes(d.statut),
  )
}

/**
 * Estimation carburant indicative, en centimes.
 * total_km × coût/km (défaut 0,15 €/km = 15 cts/km). Arrondi au centime.
 */
export function estimateFuelCostCts(
  totalKm: number | null | undefined,
  ctsPerKm: number = DEFAULT_FUEL_CTS_PER_KM,
): number {
  if (!totalKm || totalKm <= 0) return 0
  return Math.round(totalKm * ctsPerKm)
}

/**
 * L'optimisation est possible si au moins 2 arrêts géocodés sont assignés
 * ET que le dépôt est lui-même géocodé.
 */
export function canOptimize(geocodedStopCount: number, depotGeocoded: boolean): boolean {
  return geocodedStopCount >= 2 && depotGeocoded
}
