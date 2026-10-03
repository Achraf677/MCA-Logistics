import { describe, it, expect } from 'vitest'
import { validateSiren, sirenRetenu } from './clients.logic'

describe('SIREN (U2)', () => {
  it('valide 9 chiffres', () => {
    expect(validateSiren('102 898 095')).toBe(true)
    expect(validateSiren('1028980')).toBe(false)
  })
  it('retenu : saisi, sinon déduit d’un SIRET valide', () => {
    expect(sirenRetenu('102898095', null)).toBe('102898095')
    expect(sirenRetenu('', '10289809500017')).toBe('102898095')
    expect(sirenRetenu(null, '123')).toBeNull()
  })
})
