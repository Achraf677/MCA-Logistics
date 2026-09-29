import { describe, it, expect } from 'vitest'
import { codeProduit, estCodePersonnalise, produitsEffectifs } from './produitsVehicule'

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

describe('liste effective des produits', () => {
  it('fusionne base, surcharges (renommage / masquage) et personnalisés', () => {
    const l = produitsEffectifs([
      { id: '1', code: 'lpg', libelle: 'GPL', famille: 'carburant', actif: false },
      { id: '2', code: 'adblue', libelle: 'AdBlue (bidon)', famille: 'liquide', actif: true },
      { id: '3', code: 'x_gnv', libelle: 'GNV', famille: 'carburant', actif: true },
    ])
    expect(l.find(p => p.code === 'lpg')?.actif).toBe(false)
    expect(l.find(p => p.code === 'adblue')?.libelle).toBe('AdBlue (bidon)')
    expect(l.find(p => p.code === 'x_gnv')).toMatchObject({ base: false, famille: 'carburant' })
    // carburants d'abord : GNV (carburant perso) avant AdBlue (consommable)
    expect(l.findIndex(p => p.code === 'x_gnv')).toBeLessThan(l.findIndex(p => p.code === 'adblue'))
  })
})
