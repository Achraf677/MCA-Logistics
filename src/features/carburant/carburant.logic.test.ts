import { describe, it, expect } from 'vitest'
import {
  estLiquide, filtrerProduit, kpiSummary, produitsUtilises, htDuPlein, prixLitreHtMilli, consommation, consommationFlotte,
} from './carburant.logic'
import type { FuelLogRow, FuelType } from './carburant.types'

const ligne = (fuel_type: FuelType | null, liters: number, milli: number, total_cts: number) =>
  ({ fuel_type, liters, price_per_liter_milli: milli, total_cts, charge_id: null }) as unknown as FuelLogRow

describe('Carburant & liquides', () => {
  const rows = [
    ligne('diesel', 40, 1800, 7200),
    ligne('adblue', 10, 1490, 1490),
    ligne('lave_glace', 0, 0, 377),
    ligne(null, 10, 2000, 2000), // ancienne ligne sans produit = carburant
  ]

  it('distingue liquides et carburants (null = carburant)', () => {
    expect(estLiquide('adblue')).toBe(true)
    expect(estLiquide('diesel')).toBe(false)
    expect(estLiquide(null)).toBe(false)
  })

  it('compte tout dans le total HT, mais seulement les carburants dans les litres et le prix/L', () => {
    const k = kpiSummary(rows)
    expect(k.totalHtCts).toBe(7200 + 1490 + 377 + 2000)
    expect(k.totalLiters).toBe(50)
    expect(k.avgPricePerLiter).toBe((7200 + 2000) * 10 / 50)
    expect(k.nb).toBe(4)
  })

  it('filtre par famille ou par produit précis', () => {
    expect(filtrerProduit(rows, 'all')).toHaveLength(4)
    expect(filtrerProduit(rows, 'famille:carburant')).toHaveLength(2)
    expect(filtrerProduit(rows, 'famille:liquide')).toHaveLength(2)
    expect(filtrerProduit(rows, 'adblue')).toHaveLength(1)
  })

  it('liste les produits présents, du plus fréquent au plus rare', () => {
    expect(produitsUtilises([...rows, ligne('adblue', 5, 1500, 750)]).map(p => p.code))
      .toEqual(['adblue', 'diesel', 'lave_glace'])
  })
})

const plein = (vehicle_id: string, liters: number, mileage_km: number | null, fuel_type: FuelType | null = 'diesel', extra: Partial<FuelLogRow> = {}) =>
  ({ vehicle_id, liters, mileage_km, fuel_type, total_cts: 0, total_ht_cts: null, tva_cts: null, ...extra }) as unknown as FuelLogRow

describe('HT', () => {
  it('prend le HT enregistré, sinon TTC − TVA', () => {
    expect(htDuPlein({ total_ht_cts: 8333, total_cts: 10000, tva_cts: 1667 })).toBe(8333)
    expect(htDuPlein({ total_ht_cts: null, total_cts: 10000, tva_cts: 1667 })).toBe(8333)
    expect(htDuPlein({ total_ht_cts: null, total_cts: 5566, tva_cts: null })).toBe(5566)
  })
  it('prix au litre HT en millièmes', () => {
    expect(prixLitreHtMilli({ total_ht_cts: 6787, total_cts: 8145, tva_cts: 1357, liters: 44.78 })).toBe(1516)
    expect(prixLitreHtMilli({ total_ht_cts: 100, total_cts: 120, tva_cts: 20, liters: 0 })).toBe(0)
  })
})

describe('Consommation', () => {
  it('plein à plein : litres des pleins suivants / km parcourus', () => {
    const c = consommation([plein('a', 50, 1000), plein('a', 40, 1500), plein('a', 30, 1800)])!
    expect(c.km).toBe(800)
    expect(c.litres).toBe(70)
    expect(c.l100).toBeCloseTo(8.75, 5)
  })
  it('inconnue sous 2 relevés ou sans km parcourus ; ignore liquides et pleins sans km', () => {
    expect(consommation([plein('a', 50, 1000)])).toBeNull()
    expect(consommation([plein('a', 50, 1000), plein('a', 40, 1000)])).toBeNull()
    expect(consommation([plein('a', 50, 1000), plein('a', 10, 1200, 'adblue'), plein('a', 40, null)])).toBeNull()
  })
  it('flotte : somme des véhicules mesurables', () => {
    const f = consommationFlotte([
      plein('a', 50, 1000), plein('a', 40, 1500), // 40 L / 500 km
      plein('b', 30, 100), plein('b', 60, 700),   // 60 L / 600 km
      plein('c', 30, 100),                         // pas mesurable
    ])!
    expect(f.vehicules).toBe(2)
    expect(f.l100).toBeCloseTo((100 / 1100) * 100, 5)
  })
})
