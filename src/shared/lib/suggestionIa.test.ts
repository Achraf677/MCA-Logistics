import { describe, it, expect } from 'vitest'
import { parseSuggestionIa } from './suggestionIa'

const CATS = [{ id: 'cat-carburant' }, { id: 'cat-peage' }, { id: 'cat-entretien' }]

describe('parseSuggestionIa — mapping vers category_id', () => {
  it('réponse valide au-dessus du seuil → suggestion', () => {
    const r = parseSuggestionIa({ category_id: 'cat-peage', confiance: 0.92 }, CATS)
    expect(r).toEqual({ category_id: 'cat-peage', confiance: 0.92 })
  })

  it('confiance exactement au seuil (0.7) → acceptée', () => {
    const r = parseSuggestionIa({ category_id: 'cat-carburant', confiance: 0.7 }, CATS)
    expect(r.category_id).toBe('cat-carburant')
  })

  it('category_id inconnue de la liste locale → null (désynchro Edge/front)', () => {
    const r = parseSuggestionIa({ category_id: 'cat-fantome', confiance: 0.95 }, CATS)
    expect(r.category_id).toBeNull()
  })
})

describe('parseSuggestionIa — cas "inconnu"', () => {
  it('category_id null (IA pas sûre) → pas de suggestion', () => {
    const r = parseSuggestionIa({ category_id: null, confiance: 0.3 }, CATS)
    expect(r).toEqual({ category_id: null, confiance: 0.3 })
  })

  it('confiance sous le seuil → null même si la catégorie existe', () => {
    const r = parseSuggestionIa({ category_id: 'cat-peage', confiance: 0.5 }, CATS)
    expect(r.category_id).toBeNull()
    expect(r.confiance).toBe(0.5)
  })
})

describe('parseSuggestionIa — cas erreur / structure inattendue', () => {
  it('raw null / undefined / non-objet → null sans throw', () => {
    expect(parseSuggestionIa(null, CATS).category_id).toBeNull()
    expect(parseSuggestionIa(undefined, CATS).category_id).toBeNull()
    expect(parseSuggestionIa('erreur serveur', CATS).category_id).toBeNull()
    expect(parseSuggestionIa(42, CATS).category_id).toBeNull()
  })

  it('confiance non numérique / hors bornes → traitée comme 0', () => {
    expect(parseSuggestionIa({ category_id: 'cat-peage', confiance: 'haute' }, CATS).category_id).toBeNull()
    expect(parseSuggestionIa({ category_id: 'cat-peage', confiance: NaN }, CATS).category_id).toBeNull()
    expect(parseSuggestionIa({ category_id: 'cat-peage', confiance: 1.8 }, CATS).confiance).toBe(0)
    expect(parseSuggestionIa({ category_id: 'cat-peage', confiance: -0.2 }, CATS).confiance).toBe(0)
  })

  it('category_id non-string → null', () => {
    expect(parseSuggestionIa({ category_id: 123, confiance: 0.9 }, CATS).category_id).toBeNull()
  })

  it('liste de catégories vide → null', () => {
    expect(parseSuggestionIa({ category_id: 'cat-peage', confiance: 0.9 }, []).category_id).toBeNull()
  })

  it('seuil personnalisable', () => {
    const r = parseSuggestionIa({ category_id: 'cat-peage', confiance: 0.6 }, CATS, 0.5)
    expect(r.category_id).toBe('cat-peage')
  })
})
