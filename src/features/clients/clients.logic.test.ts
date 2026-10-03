import { describe, it, expect } from 'vitest'
import { validateSiren, sirenRetenu, rangerSirenSiret } from './clients.logic'

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

describe('rangerSirenSiret', () => {
  it('SIRET à 9 chiffres → passe en SIREN, SIRET vide', () => {
    expect(rangerSirenSiret(null, '509180709')).toEqual({ siren: '509180709', siret: '' })
    expect(rangerSirenSiret('509180709', '509180709')).toEqual({ siren: '509180709', siret: '' })
  })
  it('SIRET à 14 chiffres conservé', () => {
    expect(rangerSirenSiret('509180709', '50918070900012')).toEqual({ siren: '509180709', siret: '50918070900012' })
  })
})
