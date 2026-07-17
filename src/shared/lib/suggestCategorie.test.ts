import { describe, it, expect } from 'vitest'
import {
  SUGGEST_MIN_COUNT,
  SUGGEST_MIN_RATIO,
  suggestCategory,
  type ChargeHistoryItem,
} from './suggestCategorie'

const S = 'supplier-A'
const CAT_CARBURANT = 'cat-carburant'
const CAT_ENTRETIEN = 'cat-entretien'
const CAT_REPAS = 'cat-repas'

const h = (supplier_id: string | null, category_id: string | null): ChargeHistoryItem =>
  ({ supplier_id, category_id })

describe('suggestCategory', () => {
  it('supplierId null → null', () => {
    expect(suggestCategory(null, [h(S, CAT_CARBURANT), h(S, CAT_CARBURANT)])).toBeNull()
  })

  it('nouveau fournisseur (aucun historique) → null', () => {
    const history: ChargeHistoryItem[] = [
      h('other-supplier', CAT_CARBURANT),
      h('other-supplier', CAT_ENTRETIEN),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('une seule charge catégorisée du fournisseur (<2 occurrences) → null', () => {
    const history: ChargeHistoryItem[] = [h(S, CAT_CARBURANT)]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('historique = charges sans catégorie (category_id null) → null', () => {
    const history: ChargeHistoryItem[] = [
      h(S, null), h(S, null), h(S, null),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('fournisseur à catégorie dominante (100 %, ≥ 2 occurrences) → suggère', () => {
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT),
      h(S, CAT_CARBURANT),
      h(S, CAT_CARBURANT),
    ]
    expect(suggestCategory(S, history)).toBe(CAT_CARBURANT)
  })

  it('exactement 2 occurrences identiques → suggère (seuil minimal count = 2)', () => {
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT),
      h(S, CAT_CARBURANT),
    ]
    expect(suggestCategory(S, history)).toBe(CAT_CARBURANT)
  })

  it('60 % pile → suggère (seuil ratio = 60 %)', () => {
    // 3 carburant / 2 entretien = ratio 3/5 = 0.6 (>= 60%)
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT), h(S, CAT_CARBURANT), h(S, CAT_CARBURANT),
      h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN),
    ]
    expect(suggestCategory(S, history)).toBe(CAT_CARBURANT)
  })

  it('mixte sous le seuil → null (aucune catégorie ne domine)', () => {
    // 2 carburant / 2 entretien = 50 % chacun, égalité au sommet
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT), h(S, CAT_CARBURANT),
      h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('mixte avec un peu sous 60 % → null', () => {
    // 3 carburant / 3 entretien / 1 repas = 3/7 ≈ 42.9 %
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT), h(S, CAT_CARBURANT), h(S, CAT_CARBURANT),
      h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN),
      h(S, CAT_REPAS),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('ignore les charges d\'autres fournisseurs', () => {
    // Le fournisseur S n'a QUE 1 charge ; le reste est chez un autre.
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT),
      h('other-supplier', CAT_CARBURANT),
      h('other-supplier', CAT_CARBURANT),
      h('other-supplier', CAT_CARBURANT),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('égalité stricte au sommet même si ≥ 60 % → null', () => {
    // 2 carburant / 2 entretien → chacun 50 %. Ratio pas atteint + égalité.
    // Sous-cas où ratio atteint mais égalité :
    // Impossible avec 2 seules cats à égalité (max 50 %). Testons 3 chacune sur 6.
    const history: ChargeHistoryItem[] = [
      h(S, CAT_CARBURANT), h(S, CAT_CARBURANT), h(S, CAT_CARBURANT),
      h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN), h(S, CAT_ENTRETIEN),
    ]
    expect(suggestCategory(S, history)).toBeNull()
  })

  it('constantes documentées', () => {
    expect(SUGGEST_MIN_RATIO).toBe(0.6)
    expect(SUGGEST_MIN_COUNT).toBe(2)
  })
})
