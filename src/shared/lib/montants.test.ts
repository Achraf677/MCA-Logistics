import { describe, it, expect } from 'vitest'
import {
  fromHtAndRate,
  fromHtAndManualTva,
  fromTtcAndRate,
  fromTtcAndManualTva,
} from './montants'

describe('fromHtAndRate', () => {
  it('calcule TVA et TTC depuis HT et taux', () => {
    const r = fromHtAndRate(10000, 20)
    expect(r).toEqual({ ht_cts: 10000, tva_cts: 2000, ttc_cts: 12000, rate: 20 })
  })

  it('TVA à 19 % (Allemagne)', () => {
    const r = fromHtAndRate(10000, 19)
    expect(r).toEqual({ ht_cts: 10000, tva_cts: 1900, ttc_cts: 11900, rate: 19 })
  })

  it('invariant TTC = HT + TVA', () => {
    const r = fromHtAndRate(7333, 20)
    expect(r.ttc_cts).toBe(r.ht_cts + r.tva_cts)
  })

  it('valeurs non négatives — HT négatif → tout à 0', () => {
    const r = fromHtAndRate(-100, 20)
    expect(r.ht_cts).toBe(0)
    expect(r.tva_cts).toBe(0)
    expect(r.ttc_cts).toBe(0)
  })

  it('taux 0 → TVA nulle, TTC = HT', () => {
    const r = fromHtAndRate(10000, 0)
    expect(r.tva_cts).toBe(0)
    expect(r.ttc_cts).toBe(10000)
  })
})

describe('fromHtAndManualTva', () => {
  it('garde la TVA saisie 19,00 telle quelle — pas forcée à 20,00', () => {
    const r = fromHtAndManualTva(10000, 1900)
    expect(r.tva_cts).toBe(1900)
    expect(r.ttc_cts).toBe(11900)
    expect(r.rate).toBe(19)
  })

  it('TVA manuelle 20 % reste 2000', () => {
    const r = fromHtAndManualTva(10000, 2000)
    expect(r.tva_cts).toBe(2000)
    expect(r.ttc_cts).toBe(12000)
    expect(r.rate).toBe(20)
  })

  it('invariant TTC = HT + TVA', () => {
    const r = fromHtAndManualTva(8500, 1615)
    expect(r.ttc_cts).toBe(r.ht_cts + r.tva_cts)
  })

  it('valeurs non négatives', () => {
    const r = fromHtAndManualTva(-50, -10)
    expect(r.ht_cts).toBe(0)
    expect(r.tva_cts).toBe(0)
    expect(r.ttc_cts).toBe(0)
  })

  it('taux calculé pour info quand HT = 0', () => {
    const r = fromHtAndManualTva(0, 100)
    expect(r.rate).toBe(0)
  })
})

describe('fromTtcAndRate', () => {
  it('dérive HT et TVA depuis TTC + taux 20 %', () => {
    const r = fromTtcAndRate(12000, 20)
    expect(r.ht_cts).toBe(10000)
    expect(r.tva_cts).toBe(2000)
    expect(r.ttc_cts).toBe(12000)
  })

  it('invariant TTC = HT + TVA pour 19 %', () => {
    const r = fromTtcAndRate(11900, 19)
    expect(r.ttc_cts).toBe(r.ht_cts + r.tva_cts)
  })

  it('taux 0 → TVA nulle, HT = TTC', () => {
    const r = fromTtcAndRate(10000, 0)
    expect(r.tva_cts).toBe(0)
    expect(r.ht_cts).toBe(10000)
    expect(r.ttc_cts).toBe(10000)
  })

  it('valeurs non négatives', () => {
    const r = fromTtcAndRate(-500, 20)
    expect(r.ttc_cts).toBe(0)
  })
})

describe('fromTtcAndManualTva', () => {
  it('facture allemande : TTC 119 + TVA 19 → HT 100', () => {
    const r = fromTtcAndManualTva(11900, 1900)
    expect(r.ht_cts).toBe(10000)
    expect(r.tva_cts).toBe(1900)
    expect(r.ttc_cts).toBe(11900)
    expect(r.rate).toBe(19)
  })

  it('invariant TTC = HT + TVA', () => {
    const r = fromTtcAndManualTva(9250, 1542)
    expect(r.ttc_cts).toBe(r.ht_cts + r.tva_cts)
  })

  it('valeurs non négatives', () => {
    const r = fromTtcAndManualTva(-100, -20)
    expect(r.ht_cts).toBe(0)
    expect(r.tva_cts).toBe(0)
    expect(r.ttc_cts).toBe(0)
  })

  it('TVA > TTC → HT clamped à 0', () => {
    const r = fromTtcAndManualTva(1000, 1500)
    expect(r.ht_cts).toBe(0)
    expect(r.tva_cts).toBe(1500)
    expect(r.ttc_cts).toBe(1000)
  })
})
