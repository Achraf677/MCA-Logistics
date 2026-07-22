import { describe, it, expect } from 'vitest'
import { kpiSummary } from './charges.logic'
import type { ChargeRow } from './charges.types'

// Forme minimale suffisante pour kpiSummary — pas besoin de tous les champs Charge.
const charge = (over: Partial<ChargeRow> = {}): ChargeRow => ({
  id: 'c1', company_id: 'co1', supplier_id: null, date: '2026-06-04',
  label: 'Charge', category_id: null, montant_ht_cts: 10000, tva_rate: 20,
  tva_cts: 2000, montant_ttc_cts: 12000, pennylane_id: null, pennylane_synced_at: null,
  receipt_url: null, notes: null, mode_paiement: 'qonto', avance_par: null,
  rembourse_le: null, pennylane_deleted_at: null, est_immobilisation: false,
  created_at: '2026-06-04T00:00:00Z', updated_at: '2026-06-04T00:00:00Z',
  suppliers: null, charge_categories: null,
  ...over,
})

describe('kpiSummary — immobilisations exclues des totaux', () => {
  it('charge normale seule → incluse dans les totaux', () => {
    const r = kpiSummary([charge({ montant_ht_cts: 10000, montant_ttc_cts: 12000 })])
    expect(r.nb).toBe(1)
    expect(r.totalHtCts).toBe(10000)
    expect(r.totalTtcCts).toBe(12000)
  })

  it('immobilisation (Movano) exclue du total HT/TTC et du compteur nb', () => {
    // Facture AC Automobiles / Opel Movano : 7166,67 € HT / 8600 € TTC —
    // ne doit apparaître dans AUCUN total de charges d'exploitation.
    const r = kpiSummary([
      charge({ id: 'normale', montant_ht_cts: 10000, montant_ttc_cts: 12000 }),
      charge({ id: 'movano', montant_ht_cts: 716667, montant_ttc_cts: 860000, est_immobilisation: true }),
    ])
    expect(r.nb).toBe(1)
    expect(r.totalHtCts).toBe(10000)
    expect(r.totalTtcCts).toBe(12000)
  })

  it('immobilisation seule → totaux à 0', () => {
    const r = kpiSummary([charge({ montant_ht_cts: 716667, montant_ttc_cts: 860000, est_immobilisation: true })])
    expect(r.nb).toBe(0)
    expect(r.totalHtCts).toBe(0)
    expect(r.totalTtcCts).toBe(0)
  })

  it('immobilisation exclue aussi de byCategory et des avoirs', () => {
    const r = kpiSummary([
      charge({ id: 'avoir', montant_ht_cts: -500, montant_ttc_cts: -600, charge_categories: { id: 'cat1', name: 'Carburant', slug: 'carburant', type: 'carburant', is_system: true, company_id: 'co1', created_at: '', updated_at: '' } }),
      charge({ id: 'movano', montant_ht_cts: 716667, est_immobilisation: true,
        charge_categories: { id: 'cat2', name: 'Véhicules', slug: 'vehicules', type: null, is_system: false, company_id: 'co1', created_at: '', updated_at: '' } }),
    ])
    expect(r.byCategory).toEqual({ carburant: -500 })
    expect(r.nbAvoirs).toBe(1)
  })
})
