import { describe, it, expect } from 'vitest'
import {
  computeTva,
  type TvaDelivery, type TvaCharge, type TvaFuel, type TvaRaw,
} from './tva.logic'

// Helpers : construisent les formes minimales lues par la logique.
function deliv(p: Partial<TvaDelivery>): TvaDelivery {
  return {
    amount_ht_cts:   p.amount_ht_cts,
    amount_ttc_cts:  p.amount_ttc_cts,
    montant_ht_cts:  p.montant_ht_cts  ?? 0,
    montant_ttc_cts: p.montant_ttc_cts ?? 0,
  }
}
function charge(p: Partial<TvaCharge>): TvaCharge {
  // 'tva_cts' in p : respecte un null explicite (ne pas l'écraser via ??).
  return { tva_cts: 'tva_cts' in p ? p.tva_cts! : 0 }
}
function fuel(p: Partial<TvaFuel>): TvaFuel {
  return {
    tva_cts:            'tva_cts' in p ? p.tva_cts! : 0,
    tva_deductible_pct: 'tva_deductible_pct' in p ? p.tva_deductible_pct! : null,
  }
}
function raw(p: Partial<TvaRaw>): TvaRaw {
  return {
    deliveries: p.deliveries ?? [],
    charges:    p.charges    ?? [],
    fuel:       p.fuel       ?? [],
  }
}

// ── TVA collectée ────────────────────────────────────────────────────────────────
describe('computeTva — TVA collectée = Σ(ttc − ht)', () => {
  it('somme la différence ttc − ht sur les livraisons', () => {
    const r = computeTva(raw({ deliveries: [
      deliv({ montant_ht_cts: 10000, montant_ttc_cts: 12000 }), // +2000
      deliv({ montant_ht_cts:  5000, montant_ttc_cts:  6000 }), // +1000
    ]}))
    expect(r.tvaCollecteeCts).toBe(3000)
  })

  it('vaut 0 sans livraison', () => {
    expect(computeTva(raw({})).tvaCollecteeCts).toBe(0)
  })

  it('lit amount_* en priorité quand montant_* vaut 0 (fix CA faux)', () => {
    const r = computeTva(raw({ deliveries: [
      deliv({ montant_ht_cts: 0, montant_ttc_cts: 0, amount_ht_cts: 10000, amount_ttc_cts: 12000 }),
    ]}))
    expect(r.tvaCollecteeCts).toBe(2000) // 12000 − 10000
  })
})

// ── TVA déductible — charges ─────────────────────────────────────────────────────
describe('computeTva — déductible charges = Σ(tva_cts ?? 0)', () => {
  it('somme la TVA des charges', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 2000 }),
      charge({ tva_cts: 500 }),
    ]}))
    expect(r.tvaDeductibleCharges).toBe(2500)
  })

  it('compte un tva_cts null comme 0', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 1000 }),
      charge({ tva_cts: null }),
    ]}))
    expect(r.tvaDeductibleCharges).toBe(1000)
  })
})

// ── TVA déductible — carburant ───────────────────────────────────────────────────
describe('computeTva — déductible carburant = Σ round(tva_cts × pct/100)', () => {
  it('pct absent ⇒ 100 % (déductible intégral)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 3000 }), // pct absent → 100 % → 3000
    ]}))
    expect(r.tvaDeductibleCarburant).toBe(3000)
  })

  it('applique un pct < 100 (gazole 80 %)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 1000, tva_deductible_pct: 80 }), // 800
    ]}))
    expect(r.tvaDeductibleCarburant).toBe(800)
  })

  it('arrondit chaque ligne (999 × 80 % = 799,2 → 799)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 999, tva_deductible_pct: 80 }),
    ]}))
    expect(r.tvaDeductibleCarburant).toBe(799)
  })

  it('compte un tva_cts null comme 0', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: null, tva_deductible_pct: 80 }),
    ]}))
    expect(r.tvaDeductibleCarburant).toBe(0)
  })
})

// ── Solde ────────────────────────────────────────────────────────────────────────
describe('computeTva — solde = collectée − charges − carburant', () => {
  it('calcule un solde à payer (collectée > déductible)', () => {
    const r = computeTva(raw({
      deliveries: [deliv({ montant_ht_cts: 10000, montant_ttc_cts: 12000 })], // collectée 2000
      charges:    [charge({ tva_cts: 500 })],                                  // -500
      fuel:       [fuel({ tva_cts: 300, tva_deductible_pct: 100 })],           // -300
    }))
    expect(r.soldeCts).toBe(1200)
  })

  it('renvoie un solde NÉGATIF (crédit de TVA : déductible > collectée)', () => {
    const r = computeTva(raw({
      deliveries: [deliv({ montant_ht_cts: 10000, montant_ttc_cts: 11000 })], // collectée 1000
      charges:    [charge({ tva_cts: 1500 })],                                 // -1500
      fuel:       [fuel({ tva_cts: 800, tva_deductible_pct: 100 })],           // -800
    }))
    expect(r.soldeCts).toBe(-1300)
  })
})

// ── Cas vides ────────────────────────────────────────────────────────────────────
describe('computeTva — tableaux vides ⇒ 0 partout', () => {
  it('renvoie 0 sur toutes les sorties', () => {
    const r = computeTva(raw({}))
    expect(r).toEqual({
      tvaCollecteeCts: 0,
      tvaDeductibleCharges: 0,
      tvaDeductibleCarburant: 0,
      soldeCts: 0,
    })
  })
})
