import { describe, it, expect } from 'vitest'
import { soldePennylane } from './tresorerie.logic'


describe('soldePennylane', () => {
  it('somme les comptes de la dernière synchro seulement', () => {
    const rows = [
      { balance_cts: 1000, fetched_at: '2026-10-29T10:00:30Z' },
      { balance_cts: 500, fetched_at: '2026-10-29T10:00:00Z' },
      { balance_cts: 9999, fetched_at: '2026-10-28T10:00:00Z' },
    ]
    expect(soldePennylane(rows)).toBe(1500)
    expect(soldePennylane([])).toBeNull()
  })
})

import {
  aUnJustificatif, eurosEnCentimes, filtrerReleve, FILTRES_VIDES, jourLocal, releveEnCsv, totauxSelection,
  trierReleve, virementsInternes,
} from './tresorerie.logic'
import type { QontoTx } from './tresorerie.types'

function tx(p: Partial<QontoTx> & { id: string }): QontoTx {
  return {
    qonto_id: p.id, label: 'Op', amount_cts: 1000, side: 'debit', operation_type: 'card',
    settled_at: '2026-10-10T12:00:00Z', charge_id: null, justif_type: null, source: 'qonto', ...p,
  }
}

describe('relevé : filtres', () => {
  const liste = [
    tx({ id: 'a', source: 'qonto', amount_cts: 5000, label: 'Carburant Total' }),
    tx({ id: 'b', source: 'swan', amount_cts: 12050, side: 'credit', label: 'Client X', operation_type: null, charge_id: 'c1' }),
    tx({ id: 'c', source: 'swan', amount_cts: 300, label: 'Frais', settled_at: '2026-09-02T12:00:00Z' }),
  ]
  const f = (p: Partial<typeof FILTRES_VIDES>) => ({ ...FILTRES_VIDES, vue: 'fusion' as const, ...p })

  it('sépare les comptes, et la fusion garde tout', () => {
    expect(filtrerReleve(liste, f({ vue: 'qonto' })).map(t => t.id)).toEqual(['a'])
    expect(filtrerReleve(liste, f({ vue: 'swan' })).map(t => t.id)).toEqual(['b', 'c'])
    expect(filtrerReleve(liste, f({})).length).toBe(3)
  })
  it('période, montant, sens, type, justificatif', () => {
    expect(filtrerReleve(liste, f({ du: '2026-10-01' })).map(t => t.id)).toEqual(['a', 'b'])
    expect(filtrerReleve(liste, f({ au: '2026-09-30' })).map(t => t.id)).toEqual(['c'])
    expect(filtrerReleve(liste, f({ min: '100' })).map(t => t.id)).toEqual(['b'])
    expect(filtrerReleve(liste, f({ max: '10' })).map(t => t.id)).toEqual(['c'])
    expect(filtrerReleve(liste, f({ sens: 'entrees' })).map(t => t.id)).toEqual(['b'])
    expect(filtrerReleve(liste, f({ type: 'card' })).map(t => t.id)).toEqual(['a', 'c'])
    expect(filtrerReleve(liste, f({ justif: 'sans' })).map(t => t.id)).toEqual(['a', 'c'])
    expect(filtrerReleve(liste, f({ justif: 'avec' })).map(t => t.id)).toEqual(['b'])
  })
  it('la recherche trouve un libellé, un compte ou un montant', () => {
    expect(filtrerReleve(liste, f({ q: 'carbur' })).map(t => t.id)).toEqual(['a'])
    expect(filtrerReleve(liste, f({ q: 'swan' })).length).toBe(2)
    expect(filtrerReleve(liste, f({ q: '120,50' })).map(t => t.id)).toEqual(['b'])
  })
  it('trie par date et par montant', () => {
    expect(trierReleve(liste, 'date_asc').map(t => t.id)).toEqual(['c', 'a', 'b'])
    expect(trierReleve(liste, 'montant_desc').map(t => t.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('relevé : outils', () => {
  it('euros en centimes', () => {
    expect(eurosEnCentimes('12,5')).toBe(1250)
    expect(eurosEnCentimes('')).toBeNull()
    expect(eurosEnCentimes('abc')).toBeNull()
  })
  it('jour local et justificatif', () => {
    expect(jourLocal(null)).toBe('')
    expect(aUnJustificatif({ charge_id: null, justif_type: null })).toBe(false)
    expect(aUnJustificatif({ charge_id: null, justif_type: 'cca' })).toBe(true)
  })
  it('repère un virement interne et le sort des totaux', () => {
    const sortie = tx({ id: 's', source: 'qonto', side: 'debit', amount_cts: 20000 })
    const entree = tx({ id: 'e', source: 'swan', side: 'credit', amount_cts: 20000, settled_at: '2026-10-11T12:00:00Z' })
    const autre = tx({ id: 'o', source: 'qonto', side: 'credit', amount_cts: 999 })
    const internes = virementsInternes([sortie, entree, autre])
    expect([...internes].sort()).toEqual(['e', 's'])
    expect(totauxSelection([sortie, entree, autre], internes)).toEqual({ entreesCts: 999, sortiesCts: 0, netCts: 999 })
    expect(totauxSelection([sortie, entree, autre]).netCts).toBe(999)
  })
  it('même compte des deux côtés : pas un virement interne', () => {
    const a = tx({ id: 'a', source: 'qonto', side: 'debit', amount_cts: 500 })
    const b = tx({ id: 'b', source: 'qonto', side: 'credit', amount_cts: 500 })
    expect(virementsInternes([a, b]).size).toBe(0)
  })
  it('CSV : en-tête, montant signé, guillemets protégés', () => {
    const csv = releveEnCsv([tx({ id: 'x', label: 'A "B"', amount_cts: 1234, side: 'debit' })])
    const [entete, ligne] = csv.split('\n')
    expect(entete.startsWith('Date;Compte')).toBe(true)
    expect(ligne).toContain('"A ""B"""')
    expect(ligne).toContain('-12,34')
  })
})

import { detailBrut } from './tresorerie.logic'
describe('detailBrut', () => {
  it('ne garde que les textes connus', () => {
    expect(detailBrut({ counterparty_name: 'ACME', note: '', amount: 5, status: 'completed' }))
      .toEqual([{ libelle: 'Contrepartie', valeur: 'ACME' }, { libelle: 'Statut', valeur: 'completed' }])
    expect(detailBrut(null)).toEqual([])
  })
})
