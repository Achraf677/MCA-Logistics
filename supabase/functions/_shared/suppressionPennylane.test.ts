import { describe, expect, it } from 'vitest'
import { decisionSuppression } from './suppressionPennylane'

describe('decisionSuppression', () => {
  it('rien à faire sans charge manquante', () => {
    expect(decisionSuppression({ locales: 100, manquantes: 0, vues: 100 })).toBe('rien')
  })
  it('quelques factures disparues : suppression', () => {
    expect(decisionSuppression({ locales: 100, manquantes: 3, vues: 97 })).toBe('supprimer')
    expect(decisionSuppression({ locales: 12, manquantes: 8, vues: 4 })).toBe('supprimer')
  })
  it('liste Pennylane vide : on signale seulement', () => {
    expect(decisionSuppression({ locales: 50, manquantes: 50, vues: 0 })).toBe('signaler')
  })
  it('la moitié d’un coup (plus de 10) : on signale seulement', () => {
    expect(decisionSuppression({ locales: 100, manquantes: 60, vues: 40 })).toBe('signaler')
  })
})
