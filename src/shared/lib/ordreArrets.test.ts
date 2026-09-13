import { describe, it, expect } from 'vitest'
import { deplacerArret, planDeChargement } from './ordreArrets'

describe('deplacerArret', () => {
  it('remonte un arrêt d’un cran', () => {
    expect(deplacerArret(['a', 'b', 'c'], 'b', 'haut')).toEqual(['b', 'a', 'c'])
  })
  it('descend un arrêt d’un cran', () => {
    expect(deplacerArret(['a', 'b', 'c'], 'b', 'bas')).toEqual(['a', 'c', 'b'])
  })
  it('renvoie le tableau inchangé aux extrémités', () => {
    const ids = ['a', 'b', 'c']
    expect(deplacerArret(ids, 'a', 'haut')).toBe(ids)
    expect(deplacerArret(ids, 'c', 'bas')).toBe(ids)
  })
  it('renvoie le tableau inchangé sur un identifiant inconnu', () => {
    const ids = ['a', 'b']
    expect(deplacerArret(ids, 'zzz', 'haut')).toBe(ids)
  })
  it('ne modifie pas le tableau d’origine', () => {
    const ids = ['a', 'b', 'c']
    deplacerArret(ids, 'b', 'haut')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('planDeChargement', () => {
  it('inverse l’ordre de livraison : le premier livré est chargé en dernier', () => {
    const plan = planDeChargement(['client1', 'client2', 'client3'])
    expect(plan.map(p => p.item)).toEqual(['client3', 'client2', 'client1'])
  })

  it('numérote le chargement à partir de 1, au fond du camion', () => {
    const plan = planDeChargement(['A', 'B', 'C'])
    expect(plan).toEqual([
      { item: 'C', rangChargement: 1, rangLivraison: 3 },
      { item: 'B', rangChargement: 2, rangLivraison: 2 },
      { item: 'A', rangChargement: 3, rangLivraison: 1 },
    ])
  })

  it('garde le rang de livraison d’origine, pour pouvoir recoller les deux listes', () => {
    const plan = planDeChargement([{ id: 'x' }, { id: 'y' }])
    expect(plan.map(p => p.rangLivraison)).toEqual([2, 1])
    expect(plan.map(p => p.rangChargement)).toEqual([1, 2])
  })

  it('un seul arrêt : chargé en premier et livré en premier', () => {
    expect(planDeChargement(['seul'])).toEqual([
      { item: 'seul', rangChargement: 1, rangLivraison: 1 },
    ])
  })

  it('liste vide → plan vide', () => {
    expect(planDeChargement([])).toEqual([])
  })

  it('ne modifie pas le tableau reçu', () => {
    const arrets = ['A', 'B', 'C']
    planDeChargement(arrets)
    expect(arrets).toEqual(['A', 'B', 'C'])
  })
})
