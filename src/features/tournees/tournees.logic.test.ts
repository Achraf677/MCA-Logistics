import { describe, it, expect } from 'vitest'
import {
  isGeocoded, eligibleDeliveries, estimateFuelCostCts, canOptimize,
  googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  isDelivered, deliveredProgress, hasUndeliveredStops,
  canStartTour, canFinishTour,
} from './tournees.logic'
import type { TourDelivery } from './tournees.types'

function mk(partial: Partial<TourDelivery>): TourDelivery {
  return {
    id: 'x', date: '2026-06-07', statut: 'planifiee',
    description: null, delivery_address: null,
    delivery_lat: null, delivery_lng: null,
    tour_id: null, stop_order: null, arrival_time: null,
    delivered_at: null, clients: null,
    ...partial,
  }
}

describe('isGeocoded', () => {
  it('vrai si lat ET lng présents', () => {
    expect(isGeocoded(mk({ delivery_lat: 48.5, delivery_lng: 7.7 }))).toBe(true)
  })
  it('faux si une coordonnée manque', () => {
    expect(isGeocoded(mk({ delivery_lat: 48.5, delivery_lng: null }))).toBe(false)
    expect(isGeocoded(mk({ delivery_lat: null, delivery_lng: 7.7 }))).toBe(false)
  })
})

describe('eligibleDeliveries', () => {
  it('garde planifiee/en_cours/livree, écarte facturee/annulee', () => {
    const list = [
      mk({ id: 'a', statut: 'planifiee' }),
      mk({ id: 'b', statut: 'en_cours' }),
      mk({ id: 'c', statut: 'livree' }),
      mk({ id: 'd', statut: 'facturee' }),
      mk({ id: 'e', statut: 'annulee' }),
    ]
    expect(eligibleDeliveries(list).map(d => d.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('estimateFuelCostCts', () => {
  it('applique 0,15 €/km par défaut et arrondit au centime', () => {
    expect(estimateFuelCostCts(100)).toBe(1500)      // 100 km × 15 cts
    expect(estimateFuelCostCts(7.77)).toBe(117)      // 116.55 → 117 (arrondi)
  })
  it('accepte un coût/km personnalisé', () => {
    expect(estimateFuelCostCts(100, 20)).toBe(2000)
  })
  it('renvoie 0 pour km absent ou nul', () => {
    expect(estimateFuelCostCts(null)).toBe(0)
    expect(estimateFuelCostCts(0)).toBe(0)
  })
})

describe('canOptimize', () => {
  it('exige ≥ 2 arrêts géocodés ET un dépôt géocodé', () => {
    expect(canOptimize(2, true)).toBe(true)
    expect(canOptimize(1, true)).toBe(false)
    expect(canOptimize(2, false)).toBe(false)
    expect(canOptimize(0, false)).toBe(false)
  })
})

describe('navigation GPS', () => {
  it('googleMapsStopUrl → destination simple', () => {
    expect(googleMapsStopUrl(48.5839, 7.7521))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=48.5839,7.7521')
  })

  it('wazeUrl → point + navigate', () => {
    expect(wazeUrl(48.5839, 7.7521))
      .toBe('https://waze.com/ul?ll=48.5839,7.7521&navigate=yes')
  })

  it('googleMapsRouteUrl → dépôt origine+destination, waypoints ordonnés et encodés', () => {
    const depot = { lat: 48.50, lng: 7.50 }
    const stops = [
      { stop_order: 2, lat: 48.62, lng: 7.62 },
      { stop_order: 1, lat: 48.61, lng: 7.61 },
    ]
    const url = googleMapsRouteUrl(depot, stops)!
    expect(url).toContain('origin=48.5,7.5')
    expect(url).toContain('destination=48.5,7.5')
    // ordonné par stop_order (1 puis 2), séparateur | encodé en %7C, virgules en %2C
    expect(url).toContain('waypoints=48.61%2C7.61%7C48.62%2C7.62')
  })

  it('googleMapsRouteUrl → null sans dépôt, base seule sans waypoints', () => {
    expect(googleMapsRouteUrl(null, [])).toBeNull()
    const url = googleMapsRouteUrl({ lat: 1, lng: 2 }, [])!
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&origin=1,2&destination=1,2')
  })
})

describe('suivi des arrêts', () => {
  it('isDelivered → vrai si statut livree', () => {
    expect(isDelivered(mk({ statut: 'livree' }))).toBe(true)
    expect(isDelivered(mk({ statut: 'en_cours' }))).toBe(false)
  })

  it('deliveredProgress → X / N', () => {
    const stops = [mk({ statut: 'livree' }), mk({ statut: 'planifiee' }), mk({ statut: 'livree' })]
    expect(deliveredProgress(stops)).toEqual({ delivered: 2, total: 3 })
    expect(deliveredProgress([])).toEqual({ delivered: 0, total: 0 })
  })

  it('hasUndeliveredStops', () => {
    expect(hasUndeliveredStops([mk({ statut: 'livree' }), mk({ statut: 'planifiee' })])).toBe(true)
    expect(hasUndeliveredStops([mk({ statut: 'livree' })])).toBe(false)
    expect(hasUndeliveredStops([])).toBe(false)
  })
})

describe('cycle de vie tournée', () => {
  it('canStartTour → seulement optimisee', () => {
    expect(canStartTour('optimisee')).toBe(true)
    expect(canStartTour('brouillon')).toBe(false)
    expect(canStartTour('en_cours')).toBe(false)
    expect(canStartTour('terminee')).toBe(false)
  })
  it('canFinishTour → seulement en_cours', () => {
    expect(canFinishTour('en_cours')).toBe(true)
    expect(canFinishTour('optimisee')).toBe(false)
    expect(canFinishTour('terminee')).toBe(false)
  })
})
