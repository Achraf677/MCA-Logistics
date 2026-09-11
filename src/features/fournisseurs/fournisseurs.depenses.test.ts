import { describe, it, expect } from 'vitest'
import { cumulerDepensesParFournisseur, type ChargePourCumul } from './fournisseurs.logic'

const c = (o: Partial<ChargePourCumul>): ChargePourCumul => ({
  supplier_id: 'f1', date: '2026-03-10', montant_ht_cts: 10000, ...o,
})

describe('cumul des depenses par fournisseur', () => {
  it('additionne et retient la facture la plus recente', () => {
    const m = cumulerDepensesParFournisseur([
      c({ date: '2026-01-05', montant_ht_cts: 5000 }),
      c({ date: '2026-03-10', montant_ht_cts: 7000 }),
      c({ date: '2026-02-20', montant_ht_cts: 3000 }),
    ])
    expect(m.get('f1')).toEqual({ totalHtCts: 15000, derniereDate: '2026-03-10', nbFactures: 3 })
  })

  it('separe bien deux fournisseurs', () => {
    const m = cumulerDepensesParFournisseur([
      c({ supplier_id: 'f1', montant_ht_cts: 1000 }),
      c({ supplier_id: 'f2', montant_ht_cts: 2000 }),
    ])
    expect(m.get('f1')!.totalHtCts).toBe(1000)
    expect(m.get('f2')!.totalHtCts).toBe(2000)
  })

  it('ignore les charges sans fournisseur', () => {
    const m = cumulerDepensesParFournisseur([c({ supplier_id: null })])
    expect(m.size).toBe(0)
  })

  it('exclut les immobilisations — un achat de vehicule n est pas une depense courante', () => {
    const m = cumulerDepensesParFournisseur([
      c({ montant_ht_cts: 10000 }),
      c({ montant_ht_cts: 2_500_000, est_immobilisation: true }),
    ])
    expect(m.get('f1')).toEqual({ totalHtCts: 10000, derniereDate: '2026-03-10', nbFactures: 1 })
  })

  it('un avoir reduit le total et compte comme une facture', () => {
    const m = cumulerDepensesParFournisseur([
      c({ montant_ht_cts: 10000 }),
      c({ montant_ht_cts: -3000, date: '2026-03-12' }),
    ])
    expect(m.get('f1')).toEqual({ totalHtCts: 7000, derniereDate: '2026-03-12', nbFactures: 2 })
  })

  it('un fournisseur dont tout est immobilisation n apparait pas', () => {
    const m = cumulerDepensesParFournisseur([c({ est_immobilisation: true })])
    expect(m.has('f1')).toBe(false)
  })

  it('liste vide -> map vide, pas d erreur', () => {
    expect(cumulerDepensesParFournisseur([]).size).toBe(0)
  })

  it('ne modifie pas le tableau recu', () => {
    const entree = [c({}), c({ supplier_id: 'f2' })]
    const copie = JSON.parse(JSON.stringify(entree))
    cumulerDepensesParFournisseur(entree)
    expect(entree).toEqual(copie)
  })
})
