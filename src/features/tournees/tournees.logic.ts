// Logique pure des Tournées : éligibilité, géocodage, carburant, navigation GPS,
// suivi des arrêts et cycle de vie. Aucune dépendance DB ni DOM.

import type { Tour, TourDelivery, TourStatus } from './tournees.types'

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

// ── Navigation GPS (liens externes) ───────────────────────────────────────────

export interface GeoPoint { lat: number; lng: number }
export interface OrderedStop extends GeoPoint { stop_order: number | null }

/** Lien Google Maps vers un arrêt unique (destination simple). */
export function googleMapsStopUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Lien Waze vers un point, navigation lancée. */
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
}

/**
 * Itinéraire complet Google Maps : dépôt en origine ET destination,
 * arrêts géocodés en waypoints dans l'ordre stop_order. null si pas de dépôt.
 * Le séparateur waypoints « | » et les virgules sont encodés (encodeURIComponent).
 */
export function googleMapsRouteUrl(depot: GeoPoint | null, stops: OrderedStop[]): string | null {
  if (!depot) return null
  const ordered = [...stops]
    .filter(s => s.lat != null && s.lng != null)
    .sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
  const base =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${depot.lat},${depot.lng}` +
    `&destination=${depot.lat},${depot.lng}`
  if (ordered.length === 0) return base
  const waypoints = ordered.map(s => `${s.lat},${s.lng}`).join('|')
  return `${base}&waypoints=${encodeURIComponent(waypoints)}`
}

// ── Suivi des arrêts ──────────────────────────────────────────────────────────

/** Un arrêt est considéré livré dès que son statut est 'livree'. */
export function isDelivered(s: Pick<TourDelivery, 'statut'>): boolean {
  return s.statut === 'livree'
}

/** Compteur « X / N » d'arrêts livrés. */
export function deliveredProgress(stops: Pick<TourDelivery, 'statut'>[]): { delivered: number; total: number } {
  return { delivered: stops.filter(isDelivered).length, total: stops.length }
}

/** Reste-t-il au moins un arrêt non livré ? */
export function hasUndeliveredStops(stops: Pick<TourDelivery, 'statut'>[]): boolean {
  return stops.some(s => !isDelivered(s))
}

// ── Cycle de vie de la tournée ────────────────────────────────────────────────

/** « Démarrer » : seulement depuis une tournée optimisée. */
export function canStartTour(status: TourStatus): boolean {
  return status === 'optimisee'
}

/** « Terminer » : seulement depuis une tournée en cours. */
export function canFinishTour(status: TourStatus): boolean {
  return status === 'en_cours'
}

// ── Multi-véhicule (dispatch) ─────────────────────────────────────────────────

/** Affectation d'un véhicule (+ chauffeur optionnel) pour un dispatch multi-tournées. */
export interface Assignment {
  vehicle_id: string
  driver_id: string | null
}

/** Une tournée renvoyée par l'Edge Function optimize-tours. */
export interface DispatchedTour {
  tour_id: string
  vehicle_id: string
  stops: unknown[]
  total_km: number | null
  total_duration_min: number | null
}

/** Charge utile `data` de la réponse optimize-tours. */
export interface DispatchData {
  date: string
  tours: DispatchedTour[]
  unassigned: unknown[]
}

/** Sous-ensemble géocodé d'un pool de livraisons (réutilise isGeocoded). */
export function geocodedPool(deliveries: TourDelivery[]): TourDelivery[] {
  return deliveries.filter(isGeocoded)
}

/**
 * Le dispatch est possible s'il y a au moins une affectation véhicule
 * ET au moins une livraison géocodée dans le pool.
 */
export function canDispatch(assignments: Assignment[], pool: TourDelivery[]): boolean {
  return assignments.length >= 1 && geocodedPool(pool).length >= 1
}

/** Compare deux stop_order, null en dernier. */
function byStopOrder(a: TourDelivery, b: TourDelivery): number {
  if (a.stop_order == null && b.stop_order == null) return 0
  if (a.stop_order == null) return 1
  if (b.stop_order == null) return -1
  return a.stop_order - b.stop_order
}

/**
 * Regroupe chaque tournée avec ses livraisons (tour_id), triées par stop_order
 * croissant (null en dernier). Les tournées conservent l'ordre du tableau reçu.
 */
export function groupToursWithStops(
  tours: Tour[],
  deliveries: TourDelivery[],
): Array<{ tour: Tour; stops: TourDelivery[] }> {
  return tours.map(tour => ({
    tour,
    stops: deliveries.filter(d => d.tour_id === tour.id).sort(byStopOrder),
  }))
}

/** Somme des distances/durées sur plusieurs tournées (ignore les valeurs null). */
export function totalsAcrossTours(
  tours: Array<Pick<Tour, 'total_km' | 'total_duration_min'>>,
): { totalKm: number; totalMin: number } {
  return tours.reduce(
    (acc, t) => ({
      totalKm: acc.totalKm + (t.total_km ?? 0),
      totalMin: acc.totalMin + (t.total_duration_min ?? 0),
    }),
    { totalKm: 0, totalMin: 0 },
  )
}
