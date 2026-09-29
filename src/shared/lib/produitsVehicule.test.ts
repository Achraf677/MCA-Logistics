import { describe, it, expect } from 'vitest'
import { codeProduit, estCodePersonnalise, produitsBaseSupprimes, produitsEffectifs } from './produitsVehicule'

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

describe('produits de base supprimés', () => {
  it('disparaissent de la liste et restent restaurables', () => {
    const table = [{ id: '1', code: 'electric', libelle: 'Électrique', famille: 'carburant' as const, actif: false, supprime: true }]
    expect(produitsEffectifs(table).some(p => p.code === 'electric')).toBe(false)
    expect(produitsBaseSupprimes(table)).toEqual(['electric'])
  })
})

describe('articles & familles (étape 1)', () => {
  it('fournit les 4 familles avec leurs réglages par défaut', () => {
    const l = produitsEffectifs([])
    expect(new Set(l.map(p => p.famille))).toEqual(new Set(['carburant', 'liquide', 'entretien', 'equipement']))
    expect(l.find(p => p.code === 'vidange')?.reglages).toMatchObject({ periodiciteKm: 30000, periodiciteMois: 12, stockable: false })
    expect(l.find(p => p.code === 'adblue')?.reglages.stockable).toBe(true)
    expect(l.find(p => p.code === 'diesel')?.reglages.stockable).toBe(false)
  })

  it('applique les réglages enregistrés, sans jamais rendre stockable un carburant ou un entretien', () => {
    const l = produitsEffectifs([
      { id: '1', code: 'vidange', libelle: 'Vidange', famille: 'entretien', actif: true, periodicite_km: 20000, periodicite_mois: null, stockable: true },
      { id: '2', code: 'adblue', libelle: 'AdBlue', famille: 'liquide', actif: true, unite: 'bidon', seuil_stock: 2 },
    ])
    expect(l.find(p => p.code === 'vidange')?.reglages).toMatchObject({ periodiciteKm: 20000, periodiciteMois: null, stockable: false })
    expect(l.find(p => p.code === 'adblue')?.reglages).toMatchObject({ unite: 'bidon', seuilStock: 2, stockable: true })
  })

  it('ordonne ⛽ 🧴 🔧 📦', () => {
    const familles = produitsEffectifs([]).map(p => p.famille)
    expect(familles.indexOf('equipement')).toBeGreaterThan(familles.lastIndexOf('entretien'))
    expect(familles.indexOf('entretien')).toBeGreaterThan(familles.lastIndexOf('liquide'))
  })
})
