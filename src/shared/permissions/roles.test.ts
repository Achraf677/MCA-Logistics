import { describe, it, expect } from 'vitest'
import { libelleRole, estCompteSalarie } from './roles'

describe('rôles des comptes', () => {
  it('libellé du rôle réel, jamais « Président » par défaut', () => {
    expect(libelleRole('president')).toBe('Président')
    expect(libelleRole('chauffeur')).toBe('Salarié')
    expect(libelleRole('comptable')).toBe('Comptable')
    expect(libelleRole('inconnu')).toBe('inconnu')
    expect(libelleRole(null)).toBe('—')
  })
  it('compte salarié = rôle chauffeur seulement', () => {
    expect(estCompteSalarie('chauffeur')).toBe(true)
    expect(estCompteSalarie('dg')).toBe(false)
    expect(estCompteSalarie(undefined)).toBe(false)
  })
})
