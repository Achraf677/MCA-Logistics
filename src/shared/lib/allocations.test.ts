import { describe, it, expect } from 'vitest'
import {
  chargeResteCts,
  targetCouvertureCts,
  type AllocationPick,
} from './allocations'

const alloc = (amount: number, target_id?: string): AllocationPick =>
  ({ amount_cts: amount, target_table: 'qonto_transactions', target_id })

describe('chargeResteCts', () => {
  it('vide → montant total', () => {
    expect(chargeResteCts(2000, [])).toBe(2000)
    expect(chargeResteCts(2000, null)).toBe(2000)
    expect(chargeResteCts(2000, undefined)).toBe(2000)
  })

  it('montant total null → 0 (charge sans montant)', () => {
    expect(chargeResteCts(null, [alloc(500)])).toBe(0)
    expect(chargeResteCts(undefined, [alloc(500)])).toBe(0)
  })

  it('split 20 = 10 + 10 → reste 0', () => {
    // Éléphant Bleu 20 € = 10 € AdBlue + 10 € lave-glace
    expect(chargeResteCts(2000, [alloc(1000), alloc(1000)])).toBe(0)
  })

  it('split partiel → reste décroit', () => {
    // 20 € - 5 € - 5 € = 10 € restants
    expect(chargeResteCts(2000, [alloc(500), alloc(500)])).toBe(1000)
  })

  it('sur-allocation → 0 (plafonné)', () => {
    // Un bug applicatif peut sur-affecter ; on ne remonte pas de négatif à l'UI.
    expect(chargeResteCts(2000, [alloc(1500), alloc(1000)])).toBe(0)
  })

  it('ignore les allocations invalides (≤ 0 / non finies)', () => {
    const bad: AllocationPick[] = [
      { amount_cts: 0 },
      { amount_cts: -100 },
      { amount_cts: NaN },
      { amount_cts: 500 },
    ]
    expect(chargeResteCts(2000, bad)).toBe(1500)
  })

  it('ventilation "pure" (sans cible) : chaque ligne garde sa propre catégorie', () => {
    // Éléphant Bleu 30 € = 10 € AdBlue + 20 € lave-glace, target_table/target_id absents.
    const lignes: AllocationPick[] = [
      { amount_cts: 1000, category_id: 'cat-adblue' },
      { amount_cts: 2000, category_id: 'cat-laveglace' },
    ]
    expect(chargeResteCts(3000, lignes)).toBe(0)
    expect(lignes.map(l => l.category_id)).toEqual(['cat-adblue', 'cat-laveglace'])
  })
})

describe('targetCouvertureCts', () => {
  it('vide → montant total (rien de couvert)', () => {
    expect(targetCouvertureCts(10000, [])).toBe(10000)
  })

  it('1 mouvement 100 couvert par 3 charges → reste 0', () => {
    // 100 € = 30 + 40 + 30
    const allocs: AllocationPick[] = [alloc(3000), alloc(4000), alloc(3000)]
    expect(targetCouvertureCts(10000, allocs)).toBe(0)
  })

  it('couverture partielle → reste positif', () => {
    // 100 € couvert seulement par 60 €
    expect(targetCouvertureCts(10000, [alloc(6000)])).toBe(4000)
  })

  it('filtre par target_id si fourni (ne compte pas les autres cibles)', () => {
    const allocs: AllocationPick[] = [
      alloc(3000, 'tx-A'),
      alloc(4000, 'tx-A'),
      alloc(9999, 'tx-B'),   // n'appartient pas à tx-A
    ]
    expect(targetCouvertureCts(10000, allocs, 'tx-A')).toBe(3000)   // 10000 - 3000 - 4000
  })

  it('target_id absent des allocations → couverture 0', () => {
    const allocs: AllocationPick[] = [alloc(3000, 'tx-A')]
    expect(targetCouvertureCts(10000, allocs, 'tx-Z')).toBe(10000)
  })
})
