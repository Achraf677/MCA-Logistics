import { describe, it, expect } from 'vitest'
import {
  isGeocoded, eligibleDeliveries, estimateFuelCostCts, canOptimize,
} from './tournees.logic'
import type { TourDelivery } from './tournees.types'

function mk(partial: Partial<TourDelivery>): TourDelivery {
  return {
    id: 'x', date: '2026-06-07', statut: 'planifiee',
    description: null, delivery_address: null,
    delivery_lat: null, delivery_lng: null,
    tour_id: null, stop_order: null, arrival_time: null, clients: null,
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
