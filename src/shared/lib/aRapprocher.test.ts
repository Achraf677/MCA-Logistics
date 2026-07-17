import { describe, it, expect } from 'vitest'
import {
  countARapprocher,
  countChargesArapprocher,
  countEncaissements,
  countTresorerie,
  type ChargePick,
  type TxPick,
} from './aRapprocher'

// Helpers concis pour construire des fixtures.
const debit = (amount: number, opts: Partial<TxPick> = {}): TxPick =>
  ({ side: 'debit', amount_cts: amount, charge_id: null, justif_type: null, ...opts })
const credit = (amount: number, opts: Partial<TxPick> = {}): TxPick =>
  ({ side: 'credit', amount_cts: amount, charge_id: null, justif_type: null, ...opts })
const ch = (id: string, montant: number | null, category_id: string | null = 'cat-x'): ChargePick =>
  ({ id, montant_ttc_cts: montant, category_id })

describe('countTresorerie', () => {
  it('cas vide → 0', () => {
    expect(countTresorerie([])).toBe(0)
  })

  it('compte uniquement les débits sans charge_id ET sans justif_type', () => {
    const txs: TxPick[] = [
      debit(1000),                                    // ✅ à rapprocher
      debit(2000, { charge_id: 'c1' }),               // ❌ déjà lié
      debit(3000, { justif_type: 'frais_bancaire' }), // ❌ classé
      credit(500),                                    // ❌ crédit, hors domaine
    ]
    expect(countTresorerie(txs)).toBe(1)
  })
})

describe('countEncaissements', () => {
  it('cas vide → 0', () => {
    expect(countEncaissements([])).toBe(0)
  })

  it('compte uniquement les crédits sans justif_type', () => {
    const txs: TxPick[] = [
      credit(1000),                             // ✅ non identifié
      credit(2000, { justif_type: 'client' }),  // ❌ classé client
      credit(3000, { justif_type: 'cca' }),     // ❌ classé cca
      debit(500),                               // ❌ débit, hors domaine
    ]
    expect(countEncaissements(txs)).toBe(1)
  })
})

describe('countChargesArapprocher', () => {
  it('cas vide → 0', () => {
    expect(countChargesArapprocher([], [])).toBe(0)
  })

  it('ne compte que les charges non liées ET dont montant matche un débit à rapprocher', () => {
    const txs: TxPick[] = [
      debit(1000),                                 // ✅ à rapprocher (matche c1)
      debit(2000, { charge_id: 'c-linked' }),      // ❌ déjà lié → c-linked exclue même si match
      debit(4000, { justif_type: 'hors_activite'}),// ❌ débit classé
    ]
    const charges: ChargePick[] = [
      ch('c1', 1000),         // ✅ non lié + match 1000 → compté
      ch('c-linked', 2000),   // ❌ déjà lié à un débit
      ch('c3', 9999),         // ❌ non lié mais aucun débit à rapprocher au même montant
      ch('c4', null),         // ❌ pas de montant
    ]
    expect(countChargesArapprocher(txs, charges)).toBe(1)
  })

  it('un montant identique côté débits couvre plusieurs charges (compte chaque charge)', () => {
    const txs: TxPick[] = [debit(1000)]
    const charges: ChargePick[] = [ch('c1', 1000), ch('c2', 1000), ch('c3', 500)]
    expect(countChargesArapprocher(txs, charges)).toBe(2)
  })
})

describe('countARapprocher — agrégation', () => {
  it('cas 0 partout → total 0 (état neutre)', () => {
    expect(countARapprocher([], [])).toEqual({
      tresorerie: 0, charges: 0, encaissements: 0, categorisation: 0, total: 0,
    })
  })

  it('cas mixte', () => {
    const txs: TxPick[] = [
      debit(1000),                                // ✅ trésorerie
      debit(2000, { charge_id: 'linked' }),       // ❌ classé
      debit(3000),                                // ✅ trésorerie
      credit(500),                                // ✅ encaissement
      credit(700, { justif_type: 'client' }),     // ❌ classé
    ]
    const charges: ChargePick[] = [
      ch('linked', 2000), // exclue (déjà liée)
      ch('c1', 1000),     // ✅ candidate (match débit 1000)
      ch('c2', 3000),     // ✅ candidate (match débit 3000)
      ch('c3', 9999),     // ❌ aucun match
    ]
    expect(countARapprocher(txs, charges)).toEqual({
      tresorerie: 2,
      charges: 2,
      encaissements: 1,
      categorisation: 0,      // toutes les charges du fixture ont category_id
      total: 3,               // 2 + 1 — charges NON additionné (miroir)
    })
  })

  it("total n'additionne jamais charges (miroir de tresorerie)", () => {
    // Preuve d'invariant : total === tresorerie + encaissements + categorisation,
    // quels que soient les charges "candidates rapprochement" (b).
    const txs: TxPick[] = [debit(1000), credit(500)]
    const many = Array.from({ length: 50 }, (_, i) => ch(`c${i}`, 1000, 'cat-x'))
    const r = countARapprocher(txs, many)
    expect(r.total).toBe(r.tresorerie + r.encaissements + r.categorisation)
  })

  it('compte les charges sans category_id (categorisation)', () => {
    const charges: ChargePick[] = [
      ch('c1', 1000, null),      // ✅ non catégorisée
      ch('c2', 2000, null),      // ✅ non catégorisée
      ch('c3', 3000, 'cat-x'),   // ❌ catégorisée
    ]
    const r = countARapprocher([], charges)
    expect(r.categorisation).toBe(2)
    expect(r.total).toBe(2)   // 0 tresorerie + 0 encaissements + 2 categorisation
  })
})
