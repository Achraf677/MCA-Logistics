import { describe, it, expect } from 'vitest'
import { estLiquide, filtrerFamille, kpiSummary } from './carburant.logic'
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

  it('compte tout dans le total, mais seulement les carburants dans les litres et le prix/L', () => {
    const k = kpiSummary(rows)
    expect(k.totalCts).toBe(7200 + 1490 + 377 + 2000)
    expect(k.totalLiters).toBe(50)
    expect(k.avgPricePerLiter).toBe((1800 * 40 + 2000 * 10) / 50)
    expect(k.nb).toBe(4)
  })

  it('filtre par famille', () => {
    expect(filtrerFamille(rows, 'all')).toHaveLength(4)
    expect(filtrerFamille(rows, 'carburant')).toHaveLength(2)
    expect(filtrerFamille(rows, 'liquide')).toHaveLength(2)
  })
})
