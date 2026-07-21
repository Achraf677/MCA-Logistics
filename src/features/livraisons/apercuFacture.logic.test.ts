import { describe, it, expect } from 'vitest'
import { buildApercuFacture } from './apercuFacture.logic'
import type { ApercuFactureRow } from './apercuFacture.logic'

// Le spread final applique les overrides APRÈS les défauts : un `null` passé
// explicitement écrase bien le défaut (contrairement à `??` qui l'avalerait).
const row = (over: Partial<ApercuFactureRow> = {}): ApercuFactureRow => ({
  id: 'd1',
  date: '2026-07-19',
  description: 'Transport palette',
  delivery_address: '4 pl Kléber, Strasbourg',
  client_id: 'c1',
  clients: { name: 'Boulangerie Dupont' },
  amount_ht_cts: 10000,
  tva_cts: 2000,
  amount_ttc_cts: 12000,
  extra_lines: [],
  ...over,
})

describe('buildApercuFacture — mono livraison sans extras', () => {
  it('propage client + ligne principale + totaux HT/TVA/TTC', () => {
    const r = buildApercuFacture([row()])
    expect(r.client_name).toBe('Boulangerie Dupont')
    expect(r.count).toBe(1)
    expect(r.mixed_clients).toBe(false)
    expect(r.main_lines).toHaveLength(1)
    expect(r.extra_lines).toEqual([])
    expect(r.main_lines[0].ht_cts).toBe(10000)
    expect(r.main_lines[0].tva_rate).toBe(20)
    expect(r.main_lines[0].tva_cts).toBe(2000)
    expect(r.main_lines[0].ttc_cts).toBe(12000)
    expect(r.totals).toEqual({ ht_cts: 10000, tva_cts: 2000, ttc_cts: 12000 })
  })

  it('fallback description → delivery_address puis "Transport"', () => {
    const r1 = buildApercuFacture([row({ description: null })])
    expect(r1.main_lines[0].label).toBe('4 pl Kléber, Strasbourg')
    const r2 = buildApercuFacture([row({ description: '', delivery_address: null })])
    expect(r2.main_lines[0].label).toBe('Transport')
  })

  it('legacy montant_* utilisé si amount_* nul', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: null, amount_ttc_cts: null, tva_cts: null,
      montant_ht_cts: 5000, montant_ttc_cts: 6000,
    })])
    expect(r.totals.ht_cts).toBe(5000)
    expect(r.totals.ttc_cts).toBe(6000)
    expect(r.totals.tva_cts).toBe(1000)
  })
})

describe('buildApercuFacture — mono livraison avec extras', () => {
  it('somme HT + extras + invariant HT+TVA=TTC', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
      extra_lines: [
        { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
        { label: 'Retour à vide',  quantity: 1, amount_ht_cts: 1500, tva_rate: 20 },
      ],
    })])
    expect(r.extra_lines).toHaveLength(2)
    expect(r.totals.ht_cts).toBe(14500)          // 10000 + 3000 + 1500
    expect(r.totals.tva_cts).toBe(2900)          // 20% de 14500
    expect(r.totals.ttc_cts).toBe(17400)         // 14500 + 2900
    // Invariant global
    expect(r.totals.ht_cts + r.totals.tva_cts).toBe(r.totals.ttc_cts)
  })

  it('quantity ≤ 0 ou NaN → 1 (clamp identique à Pennylane)', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
      extra_lines: [
        { label: 'A', quantity: 0, amount_ht_cts: 500, tva_rate: 20 },
        { label: 'B', quantity: Number.NaN, amount_ht_cts: 500, tva_rate: 20 },
      ],
    })])
    // Chaque ligne est comptée × 1
    expect(r.extra_lines[0].quantity).toBe(1)
    expect(r.extra_lines[1].quantity).toBe(1)
    expect(r.totals.ht_cts).toBe(1000)
  })

  it('label vide → "Ligne supplémentaire"', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
      extra_lines: [{ label: '', quantity: 2, amount_ht_cts: 100, tva_rate: 20 }],
    })])
    expect(r.extra_lines[0].label).toBe('Ligne supplémentaire')
    expect(r.extra_lines[0].ht_total_cts).toBe(200)
  })

  it('multi extras à TVA différente — somme par ligne', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
      extra_lines: [
        { label: 'X', quantity: 1, amount_ht_cts: 10000, tva_rate: 20 },
        { label: 'Y', quantity: 1, amount_ht_cts: 10000, tva_rate: 10 },
      ],
    })])
    expect(r.totals.ht_cts).toBe(20000)
    // 20% de 10000 + 10% de 10000 = 2000 + 1000 = 3000
    expect(r.totals.tva_cts).toBe(3000)
    expect(r.totals.ttc_cts).toBe(23000)
  })
})

describe('buildApercuFacture — multi livraisons', () => {
  it('N livraisons du même client → count=N, une main_line par livraison', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000 }),
      row({ id: 'd2', amount_ht_cts: 5000,  tva_cts: 1000, amount_ttc_cts: 6000 }),
      row({ id: 'd3', amount_ht_cts: 3000,  tva_cts: 600,  amount_ttc_cts: 3600 }),
    ])
    expect(r.count).toBe(3)
    expect(r.main_lines).toHaveLength(3)
    expect(r.mixed_clients).toBe(false)
    expect(r.totals.ht_cts).toBe(18000)
    expect(r.totals.tva_cts).toBe(3600)
    expect(r.totals.ttc_cts).toBe(21600)
  })

  it('clients hétérogènes → flag mixed_clients à true', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', clients: { name: 'A' } }),
      row({ id: 'd2', clients: { name: 'B' } }),
    ])
    expect(r.mixed_clients).toBe(true)
    // Le nom retenu = celui du 1er row (contrat documenté).
    expect(r.client_name).toBe('A')
  })

  it('mix ligne principale + extras sur plusieurs livraisons — invariant HT+TVA=TTC', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
            extra_lines: [{ label: 'Att.', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 }] }),
      row({ id: 'd2', amount_ht_cts: 5000, tva_cts: 1000, amount_ttc_cts: 6000,
            extra_lines: [{ label: 'Att.', quantity: 2, amount_ht_cts: 2000, tva_rate: 20 }] }),
    ])
    // Totaux : HT = 10000 + 3000 + 5000 + (2000*2) = 22000
    //         TVA = 20% de 22000 = 4400
    //         TTC = 26400
    expect(r.totals.ht_cts).toBe(22000)
    expect(r.totals.tva_cts).toBe(4400)
    expect(r.totals.ttc_cts).toBe(26400)
    expect(r.totals.ht_cts + r.totals.tva_cts).toBe(r.totals.ttc_cts)
    expect(r.main_lines).toHaveLength(2)
    expect(r.extra_lines).toHaveLength(2)
  })
})

describe('buildApercuFacture — cas limites', () => {
  it('HT à 0 → tva_rate = 0 (pas de division par zéro)', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0 })])
    expect(r.main_lines[0].tva_rate).toBe(0)
    expect(r.totals).toEqual({ ht_cts: 0, tva_cts: 0, ttc_cts: 0 })
  })

  it('extras null/undefined tolérés', () => {
    const r = buildApercuFacture([row({ extra_lines: null })])
    expect(r.extra_lines).toEqual([])
  })
})
