import { describe, it, expect } from 'vitest'
import { getMatchingChargesForDebit, classifyDebit, suggestJustifType } from './rapprochementQonto'
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
  it('justifie_charge si charge_id set (priorité maximale)', () => {
    expect(classifyDebit('uuid-123', null, 0)).toBe('justifie_charge')
    expect(classifyDebit('uuid-123', null, 3)).toBe('justifie_charge')
    // charge_id prime même si justifType est aussi set
    expect(classifyDebit('uuid-123', 'cca', 0)).toBe('justifie_charge')
  })

  it('justifie_type si justifType set et pas de charge_id', () => {
    expect(classifyDebit(null, 'cca', 0)).toBe('justifie_type')
    expect(classifyDebit(null, 'frais_bancaire', 3)).toBe('justifie_type')
    expect(classifyDebit(null, 'hors_activite', 0)).toBe('justifie_type')
  })

  it('a_rapprocher si rien et matchCount > 0', () => {
    expect(classifyDebit(null, null, 1)).toBe('a_rapprocher')
    expect(classifyDebit(null, null, 5)).toBe('a_rapprocher')
  })

  it('sans_justificatif en dernier ressort', () => {
    expect(classifyDebit(null, null, 0)).toBe('sans_justificatif')
  })
})

describe('suggestJustifType', () => {
  it("CCA si transfer et nom d'associe dans label (ordre naturel)", () => {
    expect(suggestJustifType('VIR ACHRAF CHIKRI 2026', 'transfer', ['Achraf Chikri']))
      .toBe('cca')
  })

  it("CCA si transfer et nom d'associe dans label (ordre inverse)", () => {
    expect(suggestJustifType('VIR CHIKRI ACHRAF 2026', 'transfer', ['Achraf Chikri']))
      .toBe('cca')
  })

  it('CCA : casse et accents ignores', () => {
    expect(suggestJustifType('Virement Elodie Dupont', 'transfer', ['Elodie Dupont']))
      .toBe('cca')
  })

  it('pas CCA si transfer mais aucun associe ne matche', () => {
    expect(suggestJustifType('VIR DURAND PIERRE', 'transfer', ['Achraf Chikri']))
      .toBeNull()
  })

  it('pas CCA si pas transfer (operation card)', () => {
    expect(suggestJustifType('Achraf Chikri remboursement', 'card', ['Achraf Chikri']))
      .toBeNull()
  })

  it('frais_bancaire si operationType qonto_fee', () => {
    expect(suggestJustifType('Mensualite plan business', 'qonto_fee', []))
      .toBe('frais_bancaire')
  })

  it('frais_bancaire si label contient qonto (casse ignoree)', () => {
    expect(suggestJustifType('QONTO FEE JUILLET', 'card', []))
      .toBe('frais_bancaire')
  })

  it('null si rien ne matche', () => {
    expect(suggestJustifType('Fournitures bureau', 'card', ['Achraf Chikri']))
      .toBeNull()
  })

  it('null si label et operationType vides', () => {
    expect(suggestJustifType(null, null, [])).toBeNull()
  })
})
