import { describe, it, expect } from 'vitest'
import { recapParCategorie, recapParVehicule, kpiSummary, type VentilationEntretien } from './entretiens.logic'
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

describe('recapParCategorie', () => {
  const VIDE = new Map<string, VentilationEntretien[]>()

  function avecCharge(id: string, chargeId: string, cout: number | null = 1000): MaintenanceRow {
    return mk({
      id, cost_cts: cout,
      charges: { id: chargeId, label: 'F', montant_ttc_cts: cout, receipt_url: null, pennylane_id: null },
    })
  }

  it('éclate une facture ventilée dans toutes ses catégories', () => {
    // C'est tout l'intérêt : une facture de station porte du lave-glace ET de
    // l'AdBlue. Un « type » unique ne pouvait pas dire ça.
    const v = new Map<string, VentilationEntretien[]>([
      ['ch1', [
        { amount_cts: 3000, note: null, charge_categories: { name: 'AdBlue' } },
        { amount_cts: 1000, note: null, charge_categories: { name: 'Lave-glace' } },
      ]],
    ])
    const lignes = recapParCategorie([avecCharge('a', 'ch1')], v)
    expect(lignes.map(l => [l.libelle, l.total_cts])).toEqual([
      ['AdBlue', 3000],
      ['Lave-glace', 1000],
    ])
  })

  it('additionne une même catégorie venue de plusieurs factures', () => {
    const v = new Map<string, VentilationEntretien[]>([
      ['ch1', [{ amount_cts: 3000, note: null, charge_categories: { name: 'Pneus' } }]],
      ['ch2', [{ amount_cts: 2000, note: null, charge_categories: { name: 'Pneus' } }]],
    ])
    const lignes = recapParCategorie([avecCharge('a', 'ch1'), avecCharge('b', 'ch2')], v)
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ libelle: 'Pneus', total_cts: 5000, nb: 2 })
  })

  it('retombe sur le coût de l’opération quand la facture n’est pas ventilée', () => {
    const lignes = recapParCategorie([mk({ id: 'a', cost_cts: 7000 })], VIDE)
    expect(lignes).toEqual([
      { cle: '__sans_categorie__', libelle: 'Sans catégorie', total_cts: 7000, nb: 1, nbSansCout: 0, part: 1 },
    ])
  })

  it('compte à part les opérations sans coût saisi', () => {
    const lignes = recapParCategorie([
      mk({ id: 'a', cost_cts: null }),
      mk({ id: 'b', cost_cts: null }),
      mk({ id: 'c', cost_cts: 3000 }),
    ], VIDE)
    expect(lignes[0]).toMatchObject({ nb: 3, nbSansCout: 2, total_cts: 3000 })
  })

  it('nomme une ligne ventilée sans catégorie par sa note, sinon « Sans catégorie »', () => {
    const v = new Map<string, VentilationEntretien[]>([
      ['ch1', [{ amount_cts: 500, note: 'Divers atelier', charge_categories: null }]],
      ['ch2', [{ amount_cts: 400, note: null, charge_categories: null }]],
    ])
    const lignes = recapParCategorie([avecCharge('a', 'ch1'), avecCharge('b', 'ch2')], v)
    expect(lignes.map(l => l.libelle)).toEqual(['Divers atelier', 'Sans catégorie'])
  })

  it('classe le poste le plus cher en tête', () => {
    const v = new Map<string, VentilationEntretien[]>([
      ['ch1', [{ amount_cts: 500, note: null, charge_categories: { name: 'Petit' } }]],
      ['ch2', [{ amount_cts: 90000, note: null, charge_categories: { name: 'Gros' } }]],
    ])
    expect(recapParCategorie([avecCharge('a', 'ch1'), avecCharge('b', 'ch2')], v)[0].libelle).toBe('Gros')
  })

  it('total général nul : parts à 0 plutôt qu’une division par zéro', () => {
    const lignes = recapParCategorie([mk({ id: 'a', cost_cts: null })], VIDE)
    expect(lignes[0].part).toBe(0)
    expect(Number.isNaN(lignes[0].part)).toBe(false)
  })

  it('liste vide → récap vide', () => {
    expect(recapParCategorie([], VIDE)).toEqual([])
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
