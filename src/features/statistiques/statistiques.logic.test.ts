import { describe, it, expect } from 'vitest'
import {
  caMensuel, annualTotals, topClients, chargesByCategory,
  type StatDelivery, type StatCharge, type StatFuel, type StatMaintenance,
} from './statistiques.logic'

// Helpers : construisent les formes minimales lues par la logique.
const day = (m: number) => `2026-${String(m + 1).padStart(2, '0')}-15T12:00:00`

function deliv(p: Partial<StatDelivery>): StatDelivery {
  return {
    date: p.date ?? day(0),
    amount_ht_cts: p.amount_ht_cts,
    montant_ht_cts: p.montant_ht_cts ?? 0,
    client_id: p.client_id ?? 'c1',
    // 'clients' in p : respecte un null explicite (ne pas l'écraser via ??).
    clients: 'clients' in p ? p.clients! : { name: 'Client 1' },
  }
}
function charge(p: { date?: string; montant_ht_cts?: number | null; category?: string | null }): StatCharge {
  const slug = p.category ?? null
  return {
    date: p.date ?? day(0),
    montant_ht_cts: p.montant_ht_cts ?? 0,
    charge_categories: slug ? { name: slug, slug } : null,
  }
}

// ── caMensuel ────────────────────────────────────────────────────────────────────
describe('caMensuel — CA HT par mois', () => {
  it('renvoie 12 lignes indexées 0..11', () => {
    const rows = caMensuel([])
    expect(rows).toHaveLength(12)
    expect(rows.map(r => r.month)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11])
  })

  it('agrège par mois (jeu réparti sur plusieurs mois)', () => {
    const rows = caMensuel([
      deliv({ date: day(0), montant_ht_cts: 10_000 }),
      deliv({ date: day(0), montant_ht_cts: 5_000 }),
      deliv({ date: day(3), montant_ht_cts: 7_000 }),
      deliv({ date: day(11), montant_ht_cts: 2_000 }),
    ])
    expect(rows[0].cts).toBe(15_000)
    expect(rows[3].cts).toBe(7_000)
    expect(rows[11].cts).toBe(2_000)
    expect(rows[5].cts).toBe(0)
  })

  it('un montant null compte comme 0', () => {
    const rows = caMensuel([deliv({ date: day(0), montant_ht_cts: null })])
    expect(rows[0].cts).toBe(0)
  })

  it('lit amount_ht_cts en priorité quand montant_ht_cts vaut 0 (fix CA faux)', () => {
    const rows = caMensuel([deliv({ date: day(0), montant_ht_cts: 0, amount_ht_cts: 50_000 })])
    expect(rows[0].cts).toBe(50_000)
  })

  it('tableau vide → 12 mois à 0', () => {
    expect(caMensuel([]).every(r => r.cts === 0)).toBe(true)
  })
})

// ── annualTotals ──────────────────────────────────────────────────────────────────
describe('annualTotals — 4 totaux', () => {
  it('somme chaque source indépendamment', () => {
    const data = {
      deliveries: [deliv({ montant_ht_cts: 100_000 }), deliv({ montant_ht_cts: 50_000 })],
      charges: [charge({ montant_ht_cts: 20_000 }), charge({ montant_ht_cts: 5_000 })],
      fuel: [{ date: day(0), total_cts: 8_000 }, { date: day(1), total_cts: 2_000 }] as StatFuel[],
      maintenances: [{ date: day(0), cost_cts: 3_000 }, { date: day(1), cost_cts: null }] as StatMaintenance[],
    }
    expect(annualTotals(data)).toEqual({
      caTotal: 150_000,
      chargesTotal: 25_000,
      fuelTotal: 10_000,
      maintenanceTotal: 3_000, // le null compte comme 0
    })
  })

  it('sources vides → tous les totaux à 0', () => {
    expect(annualTotals({ deliveries: [], charges: [], fuel: [], maintenances: [] }))
      .toEqual({ caTotal: 0, chargesTotal: 0, fuelTotal: 0, maintenanceTotal: 0 })
  })
})

// ── topClients ────────────────────────────────────────────────────────────────────
describe('topClients — regroupement, tri, limite', () => {
  it('cumule les livraisons d\'un même client et trie décroissant', () => {
    const top = topClients([
      deliv({ client_id: 'a', clients: { name: 'Alpha' }, montant_ht_cts: 10_000 }),
      deliv({ client_id: 'b', clients: { name: 'Beta' }, montant_ht_cts: 30_000 }),
      deliv({ client_id: 'a', clients: { name: 'Alpha' }, montant_ht_cts: 5_000 }),
    ])
    expect(top).toEqual([
      { name: 'Beta', cts: 30_000 },
      { name: 'Alpha', cts: 15_000 },
    ])
  })

  it('limite au top 5 par défaut', () => {
    const deliveries = Array.from({ length: 8 }, (_, i) =>
      deliv({ client_id: `c${i}`, clients: { name: `C${i}` }, montant_ht_cts: (i + 1) * 1_000 }),
    )
    const top = topClients(deliveries)
    expect(top).toHaveLength(5)
    // Les 5 plus gros : c7=8000, c6=7000, c5=6000, c4=5000, c3=4000
    expect(top.map(c => c.cts)).toEqual([8_000, 7_000, 6_000, 5_000, 4_000])
  })

  it('respecte un n personnalisé', () => {
    const top = topClients([
      deliv({ client_id: 'a', clients: { name: 'A' }, montant_ht_cts: 3_000 }),
      deliv({ client_id: 'b', clients: { name: 'B' }, montant_ht_cts: 2_000 }),
      deliv({ client_id: 'c', clients: { name: 'C' }, montant_ht_cts: 1_000 }),
    ], 2)
    expect(top.map(c => c.name)).toEqual(['A', 'B'])
  })

  it('nom client manquant (clients null) → « — »', () => {
    const top = topClients([deliv({ client_id: 'x', clients: null, montant_ht_cts: 4_000 })])
    expect(top).toEqual([{ name: '—', cts: 4_000 }])
  })

  it('tableau vide → []', () => {
    expect(topClients([])).toEqual([])
  })
})

// ── chargesByCategory ─────────────────────────────────────────────────────────────
describe('chargesByCategory — regroupement + tri', () => {
  it('regroupe par catégorie et trie décroissant', () => {
    const res = chargesByCategory([
      charge({ category: 'carburant', montant_ht_cts: 5_000 }),
      charge({ category: 'assurance', montant_ht_cts: 12_000 }),
      charge({ category: 'carburant', montant_ht_cts: 3_000 }),
    ])
    expect(res).toEqual([
      ['assurance', 12_000],
      ['carburant', 8_000],
    ])
  })

  it('catégorie absente → « Autres »', () => {
    const res = chargesByCategory([charge({ category: null, montant_ht_cts: 1_000 })])
    expect(res).toEqual([['Autres', 1_000]])
  })

  it('tableau vide → []', () => {
    expect(chargesByCategory([])).toEqual([])
  })
})
