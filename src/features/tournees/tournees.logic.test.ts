import { describe, it, expect } from 'vitest'
import {
  isGeocoded, eligibleDeliveries, estimateFuelCostCts, canOptimize,
  googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  isDelivered, deliveredProgress, hasUndeliveredStops,
  canStartTour, canFinishTour,
  geocodedPool, canDispatch, groupToursWithStops, totalsAcrossTours,
} from './tournees.logic'
import type { Tour, TourDelivery } from './tournees.types'

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

function mkTour(partial: Partial<Tour>): Tour {
  return {
    id: 't', company_id: 'c', date: '2026-06-07', vehicle_id: null, driver_id: null,
    status: 'optimisee', depot_lat: null, depot_lng: null,
    total_km: null, total_duration_min: null, geometry: null,
    optimized_at: null, notes: null, created_at: '', updated_at: '',
    ...partial,
  }
}

const geo = { delivery_lat: 48.5, delivery_lng: 7.7 }

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

// ── Multi-véhicule ─────────────────────────────────────────────────────────────

describe('geocodedPool', () => {
  it('ne garde que les livraisons géocodées', () => {
    const pool = [
      mk({ id: 'a', ...geo }),
      mk({ id: 'b' }),                                   // non géocodée
      mk({ id: 'c', delivery_lat: 48.6, delivery_lng: null }), // partielle → exclue
      mk({ id: 'd', delivery_lat: 48.7, delivery_lng: 7.8 }),
    ]
    expect(geocodedPool(pool).map(d => d.id)).toEqual(['a', 'd'])
  })
})

describe('canDispatch', () => {
  const assignment = { vehicle_id: 'v1', driver_id: null }
  it('faux sans aucune affectation', () => {
    expect(canDispatch([], [mk({ ...geo })])).toBe(false)
  })
  it('faux sans aucune livraison géocodée', () => {
    expect(canDispatch([assignment], [mk({ id: 'a' })])).toBe(false)
    expect(canDispatch([assignment], [])).toBe(false)
  })
  it('vrai avec ≥ 1 affectation ET ≥ 1 géocodée', () => {
    expect(canDispatch([assignment], [mk({ ...geo }), mk({ id: 'z' })])).toBe(true)
  })
})

describe('groupToursWithStops', () => {
  it('regroupe par tour_id, trie par stop_order (null en dernier), tournées stables', () => {
    const tours = [mkTour({ id: 't1' }), mkTour({ id: 't2' })]
    const deliveries = [
      mk({ id: 'd1', tour_id: 't1', stop_order: 2 }),
      mk({ id: 'd2', tour_id: 't1', stop_order: null }),
      mk({ id: 'd3', tour_id: 't1', stop_order: 1 }),
      mk({ id: 'd4', tour_id: 't2', stop_order: 1 }),
      mk({ id: 'd5', tour_id: null }),                 // non assignée → ignorée
    ]
    const grouped = groupToursWithStops(tours, deliveries)
    expect(grouped.map(g => g.tour.id)).toEqual(['t1', 't2'])
    expect(grouped[0].stops.map(s => s.id)).toEqual(['d3', 'd1', 'd2']) // 1, 2, null
    expect(grouped[1].stops.map(s => s.id)).toEqual(['d4'])
  })

  it('tournée sans arrêt → liste vide', () => {
    const grouped = groupToursWithStops([mkTour({ id: 't9' })], [])
    expect(grouped[0].stops).toEqual([])
  })
})

describe('totalsAcrossTours', () => {
  it('somme km et minutes en ignorant les null', () => {
    const tours = [
      mkTour({ total_km: 12.5, total_duration_min: 30 }),
      mkTour({ total_km: null, total_duration_min: 15 }),
      mkTour({ total_km: 7.5,  total_duration_min: null }),
    ]
    expect(totalsAcrossTours(tours)).toEqual({ totalKm: 20, totalMin: 45 })
  })
  it('liste vide → zéros', () => {
    expect(totalsAcrossTours([])).toEqual({ totalKm: 0, totalMin: 0 })
  })
})
