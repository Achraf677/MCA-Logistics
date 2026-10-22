import { describe, it, expect } from 'vitest'
import {
  countARapprocher,
  countChargesAvoirs,
  countChargesHorsPennylane,
  type ChargePick,
} from './aRapprocher'

// Helpers concis pour construire des fixtures.
const ch = (id: string, montant: number | null, category_id: string | null = 'cat-x'): ChargePick =>
  ({ id, montant_ttc_cts: montant, category_id })

describe('countChargesAvoirs', () => {
  it('cas vide → 0', () => {
    expect(countChargesAvoirs([])).toBe(0)
  })

  it('compte uniquement les charges à montant négatif', () => {
    const charges: ChargePick[] = [ch('c1', -1000), ch('c2', 2000), ch('c3', null)]
    expect(countChargesAvoirs(charges)).toBe(1)
  })
})

describe('countChargesHorsPennylane', () => {
  const AUJ = new Date('2026-09-11T10:00:00Z')
  const hors = (o: Partial<ChargePick> = {}): ChargePick => ({
    id: 'c1', montant_ttc_cts: 10000, category_id: 'cat-x',
    pennylane_id: null, date: '2026-05-29', est_immobilisation: false, ...o,
  })

  it('cas vide → 0', () => {
    expect(countChargesHorsPennylane([], AUJ)).toBe(0)
  })

  it('une charge locale ancienne est comptée', () => {
    expect(countChargesHorsPennylane([hors()], AUJ)).toBe(1)
  })

  it('une charge venue de Pennylane n est jamais comptée', () => {
    expect(countChargesHorsPennylane([hors({ pennylane_id: 'PL-1' })], AUJ)).toBe(0)
  })

  it('delai de grace : une charge saisie aujourd hui n alerte pas', () => {
    expect(countChargesHorsPennylane([hors({ date: '2026-09-11' })], AUJ)).toBe(0)
  })

  it('delai de grace : la bascule se fait exactement a 14 jours', () => {
    // 2026-08-28 = J-14 → comptee ; 2026-08-29 = J-13 → pas encore.
    expect(countChargesHorsPennylane([hors({ date: '2026-08-28' })], AUJ)).toBe(1)
    expect(countChargesHorsPennylane([hors({ date: '2026-08-29' })], AUJ)).toBe(0)
  })

  it('une immobilisation est exclue — circuit comptable a part', () => {
    expect(countChargesHorsPennylane([hors({ est_immobilisation: true })], AUJ)).toBe(0)
  })

  it('colonne non selectionnee par l appelant → non compte (retrocompat)', () => {
    const sansColonne: ChargePick = { id: 'c1', montant_ttc_cts: 10000, category_id: null }
    expect(countChargesHorsPennylane([sansColonne], AUJ)).toBe(0)
  })

  it('sans date, on ne peut pas juger de l anciennete → non compte', () => {
    expect(countChargesHorsPennylane([hors({ date: undefined })], AUJ)).toBe(0)
  })
})

describe('countARapprocher — agrégation', () => {
  it('rien à traiter → total 0', () => {
    expect(countARapprocher([])).toEqual({ categorisation: 0, pennylane_supprimees: 0, hors_pennylane: 0, avoirs: 0, total: 0 })
  })

  it('compte les charges sans category_id (catégorisation)', () => {
    const r = countARapprocher([ch('c1', 1000, null), ch('c2', 2000, null), ch('c3', 3000, 'cat-x')])
    expect(r.categorisation).toBe(2)
    expect(r.total).toBe(2)
  })

  it('compte les charges dont la facture a disparu de Pennylane (champ absent = non compté)', () => {
    const r = countARapprocher([
      { id: 'c1', montant_ttc_cts: 1000, category_id: 'x', pennylane_deleted_at: '2026-07-21T10:00:00Z' },
      { id: 'c2', montant_ttc_cts: 2000, category_id: 'x', pennylane_deleted_at: null },
      { id: 'c3', montant_ttc_cts: 3000, category_id: 'x' },
    ])
    expect(r.pennylane_supprimees).toBe(1)
    expect(r.total).toBe(1)
  })

  it('total = catégorisation + suppressions + hors Pennylane ; les avoirs restent à part', () => {
    const r = countARapprocher([
      ch('a', 1000, null), ch('b', -500),
      { ...ch('c', 1000), pennylane_deleted_at: '2026-10-01T00:00:00Z' },
    ])
    expect(r).toMatchObject({ categorisation: 1, pennylane_supprimees: 1, avoirs: 1 })
    expect(r.total).toBe(r.categorisation + r.pennylane_supprimees + r.hors_pennylane)
  })
})
