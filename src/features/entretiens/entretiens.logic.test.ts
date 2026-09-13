import { describe, it, expect } from 'vitest'
import { recapParType, recapParVehicule, kpiSummary } from './entretiens.logic'
import type { MaintenanceRow } from './entretiens.types'

function mk(p: Partial<MaintenanceRow>): MaintenanceRow {
  return {
    id: 'x', company_id: 'c', vehicle_id: 'v1', date: '2026-06-01',
    type: 'vidange', description: null, mileage_km: null, cost_cts: 1000,
    supplier_id: null, next_due_date: null, next_due_km: null,
    receipt_url: null, notes: null, charge_id: null,
    created_at: '', updated_at: '',
    vehicles: { label: 'Camion 1', plate: 'AA-123-BB' },
    suppliers: null, charges: null,
    ...p,
  }
}

describe('recapParType', () => {
  it('additionne les coûts par type', () => {
    const lignes = recapParType([
      mk({ id: 'a', type: 'pneus', cost_cts: 40000 }),
      mk({ id: 'b', type: 'pneus', cost_cts: 20000 }),
      mk({ id: 'c', type: 'vidange', cost_cts: 15000 }),
    ])
    expect(lignes.map(l => [l.libelle, l.total_cts, l.nb])).toEqual([
      ['Pneus', 60000, 2],
      ['Vidange', 15000, 1],
    ])
  })

  it('classe le poste le plus cher en tête', () => {
    const lignes = recapParType([
      mk({ id: 'a', type: 'vidange', cost_cts: 5000 }),
      mk({ id: 'b', type: 'freins', cost_cts: 90000 }),
    ])
    expect(lignes[0].libelle).toBe('Freins')
  })

  it('à coût égal, le poste le plus fréquent passe devant', () => {
    const lignes = recapParType([
      mk({ id: 'a', type: 'freins', cost_cts: 10000 }),
      mk({ id: 'b', type: 'vidange', cost_cts: 5000 }),
      mk({ id: 'c', type: 'vidange', cost_cts: 5000 }),
    ])
    expect(lignes.map(l => l.libelle)).toEqual(['Vidange', 'Freins'])
  })

  it('compte à part les opérations sans coût saisi, sans les écarter', () => {
    const lignes = recapParType([
      mk({ id: 'a', type: 'freins', cost_cts: null }),
      mk({ id: 'b', type: 'freins', cost_cts: null }),
      mk({ id: 'c', type: 'freins', cost_cts: 30000 }),
    ])
    expect(lignes).toHaveLength(1)
    expect(lignes[0].nb).toBe(3)
    expect(lignes[0].nbSansCout).toBe(2)
    expect(lignes[0].total_cts).toBe(30000)
  })

  it('regroupe les opérations sans type sous « Non typé »', () => {
    const lignes = recapParType([mk({ id: 'a', type: null, cost_cts: 7000 })])
    expect(lignes[0].libelle).toBe('Non typé')
    expect(lignes[0].total_cts).toBe(7000)
  })

  it('calcule la part de chaque poste dans le total', () => {
    const lignes = recapParType([
      mk({ id: 'a', type: 'pneus', cost_cts: 75000 }),
      mk({ id: 'b', type: 'vidange', cost_cts: 25000 }),
    ])
    expect(lignes[0].part).toBeCloseTo(0.75)
    expect(lignes[1].part).toBeCloseTo(0.25)
  })

  it('total général nul : parts à 0 plutôt qu’une division par zéro', () => {
    const lignes = recapParType([mk({ id: 'a', type: 'pneus', cost_cts: null })])
    expect(lignes[0].part).toBe(0)
    expect(Number.isNaN(lignes[0].part)).toBe(false)
  })

  it('liste vide → récap vide', () => {
    expect(recapParType([])).toEqual([])
  })
})

describe('recapParVehicule', () => {
  it('additionne par véhicule et nomme les lignes', () => {
    const lignes = recapParVehicule([
      mk({ id: 'a', vehicle_id: 'v1', vehicles: { label: 'Camion 1', plate: 'AA' }, cost_cts: 10000 }),
      mk({ id: 'b', vehicle_id: 'v1', vehicles: { label: 'Camion 1', plate: 'AA' }, cost_cts: 5000 }),
      mk({ id: 'c', vehicle_id: 'v2', vehicles: { label: 'Camion 2', plate: 'BB' }, cost_cts: 80000 }),
    ])
    expect(lignes.map(l => [l.libelle, l.total_cts])).toEqual([
      ['Camion 2', 80000],
      ['Camion 1', 15000],
    ])
  })

  it('véhicule non joint → « Véhicule inconnu » plutôt qu’une ligne muette', () => {
    const lignes = recapParVehicule([mk({ id: 'a', vehicles: null, cost_cts: 1000 })])
    expect(lignes[0].libelle).toBe('Véhicule inconnu')
  })
})

describe('kpiSummary', () => {
  it('somme les coûts en ignorant les montants absents', () => {
    const k = kpiSummary([
      mk({ id: 'a', cost_cts: 1000 }),
      mk({ id: 'b', cost_cts: null }),
    ])
    expect(k.nb).toBe(2)
    expect(k.totalCostCts).toBe(1000)
  })
})
