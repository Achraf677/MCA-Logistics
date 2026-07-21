import { describe, it, expect } from 'vitest'
import { resteCibleCts, validerMontantAllocation, etatVentilation } from './ventilation'
import type { AllocationPick } from './allocations'

const alloc = (amount: number): AllocationPick => ({ amount_cts: amount })

describe('resteCibleCts — reste décroissant', () => {
  it('sans allocation → montant total', () => {
    expect(resteCibleCts(2000, [])).toBe(2000)
  })

  it('ajout d\'allocations → reste décroît', () => {
    // 20 € cible : +10 € AdBlue → reste 10 € ; +10 € lave-glace → reste 0
    const step1 = [alloc(1000)]
    const step2 = [alloc(1000), alloc(1000)]
    expect(resteCibleCts(2000, step1)).toBe(1000)
    expect(resteCibleCts(2000, step2)).toBe(0)
  })

  it('retrait d\'allocation → reste remonte', () => {
    const avant = [alloc(1000), alloc(500)]
    const apres = [alloc(1000)]           // on retire les 5 €
    expect(resteCibleCts(2000, avant)).toBe(500)
    expect(resteCibleCts(2000, apres)).toBe(1000)
  })
})

describe('validerMontantAllocation — saisie + dépassement', () => {
  it('saisie valide (point ou virgule) → cts', () => {
    expect(validerMontantAllocation('10.50', 2000)).toEqual({ ok: true, cts: 1050 })
    expect(validerMontantAllocation('10,50', 2000)).toEqual({ ok: true, cts: 1050 })
    expect(validerMontantAllocation('20', 2000)).toEqual({ ok: true, cts: 2000 })  // = reste OK
  })

  it('vide / invalide → erreur', () => {
    expect(validerMontantAllocation('', 2000).ok).toBe(false)
    expect(validerMontantAllocation('abc', 2000).ok).toBe(false)
  })

  it('≤ 0 → erreur', () => {
    expect(validerMontantAllocation('0', 2000).ok).toBe(false)
    expect(validerMontantAllocation('-5', 2000).ok).toBe(false)
  })

  it('dépassement bloqué : montant > reste → erreur explicite', () => {
    const r = validerMontantAllocation('20,01', 2000)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Dépasse le reste')
  })

  it('la somme ne peut jamais dépasser le montant cible (scénario complet)', () => {
    // Cible 20 € : 1ʳᵉ allocation 15 € OK, la 2ᵉ de 10 € doit être refusée (reste 5 €).
    const allocations = [alloc(1500)]
    const reste = resteCibleCts(2000, allocations)
    expect(reste).toBe(500)
    expect(validerMontantAllocation('10', reste).ok).toBe(false)
    expect(validerMontantAllocation('5', reste)).toEqual({ ok: true, cts: 500 })
  })
})

describe('etatVentilation', () => {
  it('aucune allocation → aucune', () => {
    expect(etatVentilation(2000, [])).toBe('aucune')
  })
  it('partielle', () => {
    expect(etatVentilation(2000, [alloc(500)])).toBe('partielle')
  })
  it('complete quand reste = 0', () => {
    expect(etatVentilation(2000, [alloc(1000), alloc(1000)])).toBe('complete')
  })
  it('cible sans montant → aucune', () => {
    expect(etatVentilation(0, [alloc(500)])).toBe('aucune')
    expect(etatVentilation(null, [])).toBe('aucune')
  })
})
