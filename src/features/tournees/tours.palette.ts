// Palette des tournées — module pur (aucune dépendance Leaflet), importable
// côté écran sans tirer la carte dans le bundle initial.

/** Palette fixe, assignée par l'ordre des tournées (cyclique au-delà de 6). */
export const TOUR_PALETTE = ['#2563eb', '#e63946', '#06d6a0', '#f59e0b', '#8b5cf6', '#06b6d4']

export function colorForIndex(i: number): string {
  return TOUR_PALETTE[i % TOUR_PALETTE.length]
}
