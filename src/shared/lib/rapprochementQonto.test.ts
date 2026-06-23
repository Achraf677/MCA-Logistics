import { describe, it, expect } from 'vitest'
import { getMatchingChargesForDebit, classifyDebit } from './rapprochementQonto'
import type { ChargePick } from '../types/charges'

function charge(id: string, ttc: number, date = '2026-06-01'): ChargePick {
  return {
    id,
    date,
    label: `Charge ${id}`,
    montant_ht_cts: Math.round(ttc / 1.2),
    montant_ttc_cts: ttc,
    tva_cts: null,
    tva_rate: 20,
    receipt_url: null,
    pennylane_id: null,
    supplier_id: null,
    category_id: null,
    charge_categories: null,
    suppliers: null,
  }
}

describe('getMatchingChargesForDebit', () => {
  it('retourne les charges au montant TTC exact', () => {
    const charges = [charge('a', 10000), charge('b', 12000), charge('c', 10000)]
    const result = getMatchingChargesForDebit(10000, charges, new Set())
    expect(result.map(c => c.id)).toEqual(['a', 'c'])
  })

  it('exclut les charges déjà liées (linkedChargeIds)', () => {
    const charges = [charge('a', 10000), charge('b', 10000)]
    const result = getMatchingChargesForDebit(10000, charges, new Set(['a']))
    expect(result.map(c => c.id)).toEqual(['b'])
  })

  it('retourne tableau vide si aucune charge au même montant', () => {
    const result = getMatchingChargesForDebit(10000, [charge('a', 5000)], new Set())
    expect(result).toHaveLength(0)
  })

  it('toutes déjà liées → tableau vide', () => {
    const charges = [charge('a', 10000), charge('b', 10000)]
    const result = getMatchingChargesForDebit(10000, charges, new Set(['a', 'b']))
    expect(result).toHaveLength(0)
  })

  it('trie par proximité de date quand settledAt fourni', () => {
    // Débit le 15 juin ; charge 'proche' le 14, 'loin' le 1er
    const charges = [charge('loin', 10000, '2026-06-01'), charge('proche', 10000, '2026-06-14')]
    const result = getMatchingChargesForDebit(10000, charges, new Set(), '2026-06-15')
    expect(result[0].id).toBe('proche')
    expect(result[1].id).toBe('loin')
  })
})

describe('classifyDebit', () => {
  it('justifie quand charge_id est défini', () => {
    expect(classifyDebit('uuid-123', 0)).toBe('justifie')
    expect(classifyDebit('uuid-123', 3)).toBe('justifie')
  })

  it('a_rapprocher quand charge_id null et matchCount > 0', () => {
    expect(classifyDebit(null, 1)).toBe('a_rapprocher')
    expect(classifyDebit(null, 5)).toBe('a_rapprocher')
  })

  it('sans_justificatif quand charge_id null et 0 charge disponible', () => {
    expect(classifyDebit(null, 0)).toBe('sans_justificatif')
  })
})
