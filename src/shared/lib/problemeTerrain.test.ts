import { describe, it, expect } from 'vitest'
import { aProblemeOuvert, libelleMotif } from './problemeTerrain'

describe('problemeTerrain', () => {
  it('libellé connu, repli sinon', () => {
    expect(libelleMotif('absent')).toBe('Absent')
    expect(libelleMotif('xyz')).toBe('Problème')
    expect(libelleMotif(null)).toBe('Problème')
  })
  it('problème ouvert seulement sur une course ouverte et signalée', () => {
    expect(aProblemeOuvert({ statut: 'en_cours', probleme_le: '2026-09-30T10:00:00Z' })).toBe(true)
    expect(aProblemeOuvert({ statut: 'planifiee', probleme_le: '2026-09-30T10:00:00Z' })).toBe(true)
    expect(aProblemeOuvert({ statut: 'livree', probleme_le: '2026-09-30T10:00:00Z' })).toBe(false)
    expect(aProblemeOuvert({ statut: 'en_cours', probleme_le: null })).toBe(false)
  })
})
