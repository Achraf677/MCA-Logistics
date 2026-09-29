import { describe, it, expect } from 'vitest'
import { codeProduit, estCodePersonnalise } from './produitsVehicule'

describe('produits personnalisés', () => {
  it('génère un code stable préfixé x_', () => {
    expect(codeProduit('Liquide de direction assistée')).toBe('x_liquide_de_direction_assistee')
    expect(codeProduit('  GNV  ')).toBe('x_gnv')
    expect(codeProduit('***')).toBe('x_produit')
  })
  it('reconnaît un code personnalisé', () => {
    expect(estCodePersonnalise('x_gnv')).toBe(true)
    expect(estCodePersonnalise('diesel')).toBe(false)
    expect(estCodePersonnalise(null)).toBe(false)
  })
})
