import { describe, it, expect } from 'vitest'
import { mergeClientField, mergeClientEnrichedFields } from './clientSyncMerge'
import type { ClientEnrichedFields } from './clientSyncMerge'

describe('mergeClientField', () => {
  it('valeur Pennylane renseignée → utilisée (source de vérité)', () => {
    expect(mergeClientField('contact@pennylane.fr', 'ancien@local.fr')).toBe('contact@pennylane.fr')
  })

  it('valeur Pennylane null → conserve la valeur locale', () => {
    expect(mergeClientField(null, 'enrichi@local.fr')).toBe('enrichi@local.fr')
  })

  it('valeur Pennylane vide (chaîne blanche) → conserve la valeur locale', () => {
    expect(mergeClientField('   ', 'enrichi@local.fr')).toBe('enrichi@local.fr')
  })

  it('Pennylane et local absents → null', () => {
    expect(mergeClientField(null, null)).toBeNull()
    expect(mergeClientField(undefined, undefined)).toBeNull()
  })

  it('Pennylane vide, local absent → null (rien à préserver)', () => {
    expect(mergeClientField('', undefined)).toBeNull()
  })
})

describe('mergeClientEnrichedFields', () => {
  const pennylaneEmpty: ClientEnrichedFields = {
    email: null, phone: null, address: null, city: null, postal_code: null,
  }
  const pennylaneFull: ClientEnrichedFields = {
    email: 'contact@client.fr', phone: '0102030405',
    address: '1 rue Pennylane', city: 'Paris', postal_code: '75001',
  }
  const local: ClientEnrichedFields = {
    email: 'enrichi@local.fr', phone: '0611223344',
    address: '2 rue Locale', city: 'Lyon', postal_code: '69000',
  }

  it('client local enrichi + Pennylane vide sur tout → toutes les valeurs locales préservées', () => {
    expect(mergeClientEnrichedFields(pennylaneEmpty, local)).toEqual(local)
  })

  it('Pennylane renseigne tout → toutes les valeurs Pennylane utilisées', () => {
    expect(mergeClientEnrichedFields(pennylaneFull, local)).toEqual(pennylaneFull)
  })

  it('mix champ par champ : Pennylane ne renseigne que email → seul email est mis à jour', () => {
    const pennylanePartial: ClientEnrichedFields = { ...pennylaneEmpty, email: 'nouveau@client.fr' }
    const result = mergeClientEnrichedFields(pennylanePartial, local)
    expect(result.email).toBe('nouveau@client.fr')
    expect(result.phone).toBe(local.phone)
    expect(result.address).toBe(local.address)
    expect(result.city).toBe(local.city)
    expect(result.postal_code).toBe(local.postal_code)
  })

  it('client nouveau (jamais vu localement, local absent) → valeurs Pennylane telles quelles', () => {
    expect(mergeClientEnrichedFields(pennylaneFull, null)).toEqual(pennylaneFull)
    expect(mergeClientEnrichedFields(pennylaneFull, undefined)).toEqual(pennylaneFull)
  })

  it('client nouveau sans aucune donnée Pennylane ni locale → tout null', () => {
    expect(mergeClientEnrichedFields(pennylaneEmpty, null)).toEqual(pennylaneEmpty)
  })
})
