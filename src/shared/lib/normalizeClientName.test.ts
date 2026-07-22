import { describe, it, expect } from 'vitest'
import { normalizeClientName } from './normalizeClientName'

describe('normalizeClientName', () => {
  it('supprime les espaces en début/fin', () => {
    expect(normalizeClientName('  Dupont Transport  ')).toBe('DUPONT TRANSPORT')
  })

  it('réduit les espaces multiples à un seul', () => {
    expect(normalizeClientName('Dupont    Transport')).toBe('DUPONT TRANSPORT')
  })

  it('met en majuscules une casse mixte', () => {
    expect(normalizeClientName('Dupont transport SARL')).toBe('DUPONT TRANSPORT SARL')
  })

  it('ne change pas un nom déjà en majuscules', () => {
    expect(normalizeClientName('DUPONT TRANSPORT')).toBe('DUPONT TRANSPORT')
  })

  it('gère les accents (toUpperCase natif)', () => {
    expect(normalizeClientName('société générale')).toBe('SOCIÉTÉ GÉNÉRALE')
  })
})
