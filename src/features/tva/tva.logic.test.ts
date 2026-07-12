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
  return {
    tva_cts:      'tva_cts' in p ? p.tva_cts! : 0,
    tva_pays:     p.tva_pays     ?? null,   // null → FR par défaut
    linkedToFuel: p.linkedToFuel ?? false,
  }
}
function fuel(p: Partial<TvaFuel>): TvaFuel {
  return {
    tva_cts:            'tva_cts' in p ? p.tva_cts! : 0,
    tva_deductible_pct: 'tva_deductible_pct' in p ? p.tva_deductible_pct! : null,
    tva_rate:           p.tva_rate ?? null,
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

  // Intégration extra_lines : la TVA collectée = ligne principale +
  // lignes supp. facturées à Pennylane. Sans ça, la CA3 sous-déclare la TVA.
  it('inclut la TVA des extra_lines dans la TVA collectée', () => {
    const r = computeTva(raw({ deliveries: [
      {
        // Principale : 240 HT → 48 TVA (20 %) → 288 TTC
        amount_ht_cts: 24000, amount_ttc_cts: 28800,
        extra_lines: [
          // Attente : 30 HT × 1 → 6 TVA (20 %) → 36 TTC
          { label: 'Attente', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
          // Forfait : 70 HT × 1 → 14 TVA (20 %) → 84 TTC
          { label: 'Forfait', quantity: 1, amount_ht_cts: 7000, tva_rate: 20 },
        ],
      },
    ]}))
    // Total attendu : (28800 − 24000) + (3600 − 3000) + (8400 − 7000)
    //              = 4800 + 600 + 1400 = 6800
    expect(r.tvaCollecteeCts).toBe(6800)
  })
})

// ── TVA déductible — charges FR ──────────────────────────────────────────────────
describe('computeTva — déductible chargesFR = Σ(tva_cts) charges non liées, tva_pays ≠ DE', () => {
  it('somme la TVA des charges françaises', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 2000 }),
      charge({ tva_cts: 500 }),
    ]}))
    expect(r.tvaDeductibleChargesFR).toBe(2500)
  })

  it('compte un tva_cts null comme 0', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 1000 }),
      charge({ tva_cts: null }),
    ]}))
    expect(r.tvaDeductibleChargesFR).toBe(1000)
  })

  it('anti double-compte : charge linkedToFuel ignorée (déjà comptée via fuel_log)', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 1000, linkedToFuel: false }),
      charge({ tva_cts: 5000, linkedToFuel: true }),   // LECLERC → ignorée
    ]}))
    expect(r.tvaDeductibleChargesFR).toBe(1000)        // 5000 non comptée
  })

  it('charge DE (JET KEHL) → poche allemande, pas dans chargesFR', () => {
    const r = computeTva(raw({ charges: [
      charge({ tva_cts: 2267, tva_pays: 'DE' }),  // JET KEHL
      charge({ tva_cts: 1000, tva_pays: null  }),  // charge FR
    ]}))
    expect(r.tvaDeductibleChargesFR).toBe(1000)
    expect(r.tvaAllemandeCts).toBe(2267)
  })
})

// ── TVA déductible — carburant FR ────────────────────────────────────────────────
describe('computeTva — déductible carburantFR = Σ round(tva_cts × pct/100), tva_rate ≠ 19', () => {
  it('pct absent ⇒ 100 % (déductible intégral)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 3000 }), // pct absent → 100 % → 3000
    ]}))
    expect(r.tvaDeductibleCarburantFR).toBe(3000)
  })

  it('applique un pct < 100 (gazole 80 %)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 1000, tva_deductible_pct: 80 }), // 800
    ]}))
    expect(r.tvaDeductibleCarburantFR).toBe(800)
  })

  it('arrondit chaque ligne (999 × 80 % = 799,2 → 799)', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 999, tva_deductible_pct: 80 }),
    ]}))
    expect(r.tvaDeductibleCarburantFR).toBe(799)
  })

  it('compte un tva_cts null comme 0', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: null, tva_deductible_pct: 80 }),
    ]}))
    expect(r.tvaDeductibleCarburantFR).toBe(0)
  })

  it('fuel tva_rate=19 (JET KEHL plein DE) → poche allemande, pas dans carburantFR', () => {
    const r = computeTva(raw({ fuel: [
      fuel({ tva_cts: 2267, tva_rate: 19 }),   // plein DE
      fuel({ tva_cts: 833,  tva_rate: 20 }),   // plein FR
    ]}))
    expect(r.tvaDeductibleCarburantFR).toBe(833)
    expect(r.tvaAllemandeCts).toBe(2267)
  })
})

// ── TVA allemande ────────────────────────────────────────────────────────────────
describe('computeTva — tvaAllemandeCts (8e directive, hors CA3)', () => {
  it('cumule charges DE et fuel DE', () => {
    const r = computeTva(raw({
      charges: [charge({ tva_cts: 1000, tva_pays: 'DE' })],
      fuel:    [fuel({ tva_cts: 500, tva_rate: 19 })],
    }))
    expect(r.tvaAllemandeCts).toBe(1500)
  })

  it("solde CA3 n'inclut pas la TVA allemande", () => {
    const r = computeTva(raw({
      deliveries: [deliv({ montant_ht_cts: 10000, montant_ttc_cts: 12000 })], // collectée 2000
      charges:    [
        charge({ tva_cts: 500, tva_pays: null }),   // FR → dans solde
        charge({ tva_cts: 2267, tva_pays: 'DE' }),  // DE → hors solde
      ],
    }))
    expect(r.soldeCts).toBe(2000 - 500)  // 1500, pas 2000 - 500 - 2267
    expect(r.tvaAllemandeCts).toBe(2267)
  })
})

// ── Solde ────────────────────────────────────────────────────────────────────────
describe('computeTva — solde = collectée − chargesFR − carburantFR', () => {
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
      tvaCollecteeCts:          0,
      tvaDeductibleChargesFR:   0,
      tvaDeductibleCarburantFR: 0,
      tvaAllemandeCts:          0,
      soldeCts:                 0,
    })
  })
})
