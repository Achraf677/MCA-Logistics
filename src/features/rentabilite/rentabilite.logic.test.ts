import { describe, it, expect } from 'vitest'
import { monthlyRows, annualTotals, margeRatio, type RentabiliteRaw } from './rentabilite.logic'

// Helper : construit un RentabiliteRaw minimal. Les listes omises valent [].
function raw(p: Partial<RentabiliteRaw>): RentabiliteRaw {
  return {
    deliveries: p.deliveries ?? [],
    charges: p.charges ?? [],
    fuel: p.fuel ?? [],
    maintenances: p.maintenances ?? [],
    year: p.year ?? 2026,
  }
}

// Date au 15 du mois `m` (0-11), heure de midi pour éviter tout glissement de fuseau.
const day = (m: number) => `2026-${String(m + 1).padStart(2, '0')}-15T12:00:00`

// ── a. Agrégation mensuelle ─────────────────────────────────────────────────────
describe('monthlyRows — agrégation mensuelle', () => {
  it('renvoie toujours 12 lignes indexées 0..11', () => {
    const rows = monthlyRows(raw({}))
    expect(rows).toHaveLength(12)
    expect(rows.map(r => r.mois)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11])
  })

  it('somme par mois et par source dans la bonne ligne', () => {
    const rows = monthlyRows(raw({
      deliveries: [
        { date: day(0), montant_ht_cts: 10_000 },
        { date: day(0), montant_ht_cts: 5_000 },
        { date: day(2), montant_ht_cts: 7_000 },
      ],
      charges:      [{ date: day(0), montant_ht_cts: 2_000 }],
      fuel:         [{ date: day(0), total_cts: 1_500 }],
      maintenances: [{ date: day(2), cost_cts: 800 }],
    }))

    const jan = rows[0]
    expect(jan).toMatchObject({ mois: 0, caHt: 15_000, charges: 2_000, carburant: 1_500, entretiens: 0 })

    const mar = rows[2]
    expect(mar).toMatchObject({ mois: 2, caHt: 7_000, charges: 0, carburant: 0, entretiens: 800 })

    // Les mois sans données restent à zéro.
    expect(rows[5]).toMatchObject({ caHt: 0, charges: 0, carburant: 0, entretiens: 0, resultat: 0 })
  })

  it('CA lit amount_ht_cts en priorité quand montant_ht_cts vaut 0 (fix CA faux)', () => {
    const rows = monthlyRows(raw({
      deliveries: [{ date: day(0), montant_ht_cts: 0, amount_ht_cts: 50_000 }],
    }))
    expect(rows[0].caHt).toBe(50_000)
  })

  it('traite un montant null comme 0 (pas de NaN)', () => {
    const rows = monthlyRows(raw({
      deliveries:   [{ date: day(0), montant_ht_cts: null }],
      maintenances: [{ date: day(0), cost_cts: null }],
    }))
    expect(rows[0].caHt).toBe(0)
    expect(rows[0].entretiens).toBe(0)
    expect(rows[0].resultat).toBe(0)
  })
})

// ── b. Résultat (dont cas négatif) ──────────────────────────────────────────────
describe('monthlyRows — resultat = caHt − charges − carburant − entretiens', () => {
  it('résultat positif', () => {
    const rows = monthlyRows(raw({
      deliveries:   [{ date: day(3), montant_ht_cts: 100_000 }],
      charges:      [{ date: day(3), montant_ht_cts: 20_000 }],
      fuel:         [{ date: day(3), total_cts: 10_000 }],
      maintenances: [{ date: day(3), cost_cts: 5_000 }],
    }))
    expect(rows[3].resultat).toBe(100_000 - 20_000 - 10_000 - 5_000) // 65 000
  })

  it('résultat négatif quand les coûts dépassent le CA', () => {
    const rows = monthlyRows(raw({
      deliveries: [{ date: day(6), montant_ht_cts: 10_000 }],
      charges:    [{ date: day(6), montant_ht_cts: 30_000 }],
      fuel:       [{ date: day(6), total_cts: 5_000 }],
    }))
    expect(rows[6].resultat).toBe(10_000 - 30_000 - 5_000) // -25 000
  })
})

// ── c. Totaux = somme des 12 mois ───────────────────────────────────────────────
describe('annualTotals', () => {
  it('totaux = somme champ par champ des 12 lignes', () => {
    const rows = monthlyRows(raw({
      deliveries: [
        { date: day(0), montant_ht_cts: 10_000 },
        { date: day(1), montant_ht_cts: 20_000 },
        { date: day(11), montant_ht_cts: 5_000 },
      ],
      charges:      [{ date: day(0), montant_ht_cts: 3_000 }],
      fuel:         [{ date: day(1), total_cts: 2_000 }],
      maintenances: [{ date: day(11), cost_cts: 1_000 }],
    }))
    const t = annualTotals(rows)

    expect(t.caHt).toBe(35_000)
    expect(t.charges).toBe(3_000)
    expect(t.carburant).toBe(2_000)
    expect(t.entretiens).toBe(1_000)
    // resultat agrégé = somme des resultats mensuels = caHt total − coûts totaux
    expect(t.resultat).toBe(35_000 - 3_000 - 2_000 - 1_000)
    expect(t.resultat).toBe(rows.reduce((s, r) => s + r.resultat, 0))
  })

  it('totaux nuls sur données vides', () => {
    const t = annualTotals(monthlyRows(raw({})))
    expect(t).toEqual({ caHt: 0, charges: 0, carburant: 0, entretiens: 0, resultat: 0 })
  })
})

// ── d. Taux de marge ────────────────────────────────────────────────────────────
describe('margeRatio', () => {
  it('ratio = resultat / caHt (sans formatage)', () => {
    expect(margeRatio({ caHt: 100_000, resultat: 25_000 })).toBe(0.25)
  })

  it('ratio négatif quand le résultat est négatif', () => {
    expect(margeRatio({ caHt: 100_000, resultat: -50_000 })).toBe(-0.5)
  })

  it('CAS LIMITE caHt = 0 → null (non défini), jamais NaN/Infinity', () => {
    const r = margeRatio({ caHt: 0, resultat: 0 })
    expect(r).toBeNull()
    expect(Number.isNaN(r as number)).toBe(false)
    expect(Number.isFinite(r as number)).toBe(false) // null → ni fini ni NaN : c'est bien « non défini »
  })

  it('CAS LIMITE caHt = 0 avec resultat ≠ 0 → null (pas d\'Infinity)', () => {
    expect(margeRatio({ caHt: 0, resultat: 12_345 })).toBeNull()
  })
})
