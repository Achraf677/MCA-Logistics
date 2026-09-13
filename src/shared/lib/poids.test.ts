import { describe, it, expect } from 'vitest'
import { poidsTotal, libellePoids } from './poids'

describe('poidsTotal', () => {
  it('additionne les poids connus', () => {
    expect(poidsTotal([{ weight_kg: 120 }, { weight_kg: 80 }]))
      .toEqual({ kg: 200, nbSansPoids: 0, aUnPoids: true })
  })

  it('compte à part les courses non pesées, sans les traiter comme des zéros', () => {
    // Sur un 3,5 t, la différence entre « total » et « minimum » est
    // exactement ce qui fait passer en surcharge.
    const p = poidsTotal([{ weight_kg: 300 }, { weight_kg: null }, {}])
    expect(p).toEqual({ kg: 300, nbSansPoids: 2, aUnPoids: true })
  })

  it('aucun poids connu → aUnPoids faux', () => {
    expect(poidsTotal([{ weight_kg: null }])).toEqual({ kg: 0, nbSansPoids: 1, aUnPoids: false })
  })

  it('liste vide → rien', () => {
    expect(poidsTotal([])).toEqual({ kg: 0, nbSansPoids: 0, aUnPoids: false })
  })
})

describe('libellePoids', () => {
  it('affiche le total quand tout est pesé', () => {
    expect(libellePoids(poidsTotal([{ weight_kg: 340 }]))).toBe('340 kg')
  })

  it('dit explicitement ce qui manque', () => {
    expect(libellePoids(poidsTotal([{ weight_kg: 340 }, { weight_kg: null }])))
      .toBe('340 kg + 1 non pesée')
    expect(libellePoids(poidsTotal([{ weight_kg: 340 }, { weight_kg: null }, { weight_kg: null }])))
      .toBe('340 kg + 2 non pesées')
  })

  it('sans aucun poids, annonce le nombre de courses non pesées', () => {
    expect(libellePoids(poidsTotal([{ weight_kg: null }]))).toBe('1 course non pesée')
    expect(libellePoids(poidsTotal([{ weight_kg: null }, {}]))).toBe('2 courses non pesées')
  })

  it('rien du tout → null, pour que l’écran n’affiche pas une ligne vide', () => {
    expect(libellePoids(poidsTotal([]))).toBeNull()
  })
})
