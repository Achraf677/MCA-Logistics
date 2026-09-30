import { describe, it, expect } from 'vitest'
import {
  estFacturationBloquee, tauxTvaInitial, montantsAEcrire, recapMontant,
} from './livraisons.logic'

describe('estFacturationBloquee', () => {
  it('facturee + sync_pending + sans facture → bloquée', () => {
    expect(estFacturationBloquee({ statut: 'facturee', sync_pending: true, pennylane_invoice_id: null })).toBe(true)
  })
  it('facture Pennylane présente → jamais bloquée (une facture émise ne se défait pas)', () => {
    expect(estFacturationBloquee({ statut: 'facturee', sync_pending: true, pennylane_invoice_id: '123' })).toBe(false)
  })
  it('sync_pending faux ou autre statut → pas bloquée', () => {
    expect(estFacturationBloquee({ statut: 'facturee', sync_pending: false, pennylane_invoice_id: null })).toBe(false)
    expect(estFacturationBloquee({ statut: 'livree', sync_pending: true, pennylane_invoice_id: null })).toBe(false)
    expect(estFacturationBloquee({ statut: 'payee', sync_pending: true, pennylane_invoice_id: null })).toBe(false)
  })
})

describe('tauxTvaInitial', () => {
  it('taux stocké exact : 5,5 reste 5,5 (plus d’arrondi entier)', () => {
    expect(tauxTvaInitial({ tva_rate: 5.5, tva_cts: 55, amount_ht_cts: 1000 })).toBe(5.5)
    expect(tauxTvaInitial({ tva_rate: '5.50', tva_cts: 55, amount_ht_cts: 1000 })).toBe(5.5)
  })
  it('taux stocké 0 respecté', () => {
    expect(tauxTvaInitial({ tva_rate: 0, tva_cts: 0, amount_ht_cts: 1000 })).toBe(0)
  })
  it('sans taux : déduit de TVA/HT au dixième', () => {
    expect(tauxTvaInitial({ tva_rate: null, tva_cts: 55, amount_ht_cts: 1000 })).toBe(5.5)
    expect(tauxTvaInitial({ tva_rate: null, tva_cts: 2000, amount_ht_cts: 10000 })).toBe(20)
  })
  it('rien → 20', () => {
    expect(tauxTvaInitial({})).toBe(20)
    expect(tauxTvaInitial({ tva_rate: null, tva_cts: null, amount_ht_cts: 1000 })).toBe(20)
  })
})

describe('montantsAEcrire', () => {
  const computed = { amount_ht_cts: 10000, tva_cts: 550, amount_ttc_cts: 10550 }

  it('calcul présent → HT/TVA/TTC + taux', () => {
    expect(montantsAEcrire(computed, { autoliquidation: false, tauxPct: 5.5 }))
      .toEqual({ amount_ht_cts: 10000, tva_cts: 550, amount_ttc_cts: 10550, tva_rate: 5.5 })
  })

  it('calcul nul → RIEN n’est écrit (montants existants conservés)', () => {
    const r = montantsAEcrire(null, { autoliquidation: false, tauxPct: 20, htExistantCts: 10000 })
    expect(r).toEqual({})
    expect('amount_ht_cts' in r).toBe(false)
    expect('tva_cts' in r).toBe(false)
    expect('amount_ttc_cts' in r).toBe(false)
  })

  it('autoliquidation : taux 0, TVA 0, TTC = HT', () => {
    expect(montantsAEcrire(computed, { autoliquidation: true, tauxPct: 20 }))
      .toEqual({ amount_ht_cts: 10000, tva_cts: 0, amount_ttc_cts: 10000, tva_rate: 0 })
  })

  it('autoliquidation sans calcul : garde le HT en base, aligne TTC dessus, n’écrit pas de HT', () => {
    expect(montantsAEcrire(null, { autoliquidation: true, tauxPct: 20, htExistantCts: 8000 }))
      .toEqual({ tva_cts: 0, amount_ttc_cts: 8000, tva_rate: 0 })
  })

  it('autoliquidation sans calcul ni HT connu : aucun TTC écrit', () => {
    expect(montantsAEcrire(null, { autoliquidation: true, tauxPct: 20, htExistantCts: null }))
      .toEqual({ tva_cts: 0, tva_rate: 0 })
  })
})

describe('recapMontant', () => {
  const extras = [
    { label: 'Attente', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
    { label: 'Retour', quantity: 2, amount_ht_cts: 1000, tva_rate: 10 },
  ]

  it('régime normal : TVA des extras ligne par ligne', () => {
    const r = recapMontant({ ht_cts: 10000, tva_cts: 2000, ttc_cts: 12000, extraLines: extras, autoliquidation: false })
    expect(r.extras_ht_cts).toBe(5000)
    expect(r.extras_tva_cts).toBe(800)       // 600 + 200
    expect(r.ttc_total_cts).toBe(17800)      // 12000 + 5000 + 800
    expect(r.taux_extras_force).toBeNull()
  })

  it('autoliquidation : TVA 0 partout, TTC = HT (principale + extras)', () => {
    const r = recapMontant({ ht_cts: 10000, tva_cts: 2000, ttc_cts: 12000, extraLines: extras, autoliquidation: true })
    expect(r.tva_cts).toBe(0)
    expect(r.extras_tva_cts).toBe(0)
    expect(r.ttc_total_cts).toBe(15000)
    expect(r.taux_extras_force).toBe(0)
  })

  it('aucun montant connu → TTC null ; extras seuls → TTC des extras', () => {
    expect(recapMontant({ ht_cts: null, tva_cts: null, ttc_cts: null, extraLines: [], autoliquidation: false }).ttc_total_cts).toBeNull()
    expect(recapMontant({ ht_cts: null, tva_cts: null, ttc_cts: null, extraLines: extras, autoliquidation: false }).ttc_total_cts).toBe(5800)
    expect(recapMontant({ ht_cts: null, tva_cts: null, ttc_cts: null, extraLines: extras, autoliquidation: true }).ttc_total_cts).toBe(5000)
  })
})
