import { describe, it, expect } from 'vitest'
import { snapVatRate } from './tvaRate'

describe('snapVatRate', () => {
  it('20% standard : 10000 HT, 2000 TVA → 20', () => {
    expect(snapVatRate(2000, 10000)).toBe(20)
  })

  it('19% allemand : 10000 HT, 1900 TVA → 19', () => {
    expect(snapVatRate(1900, 10000)).toBe(19)
  })

  it('avoir négatif (−690 TTC / −138 TVA) → 20', () => {
    expect(snapVatRate(-138, -690)).toBe(20)
  })

  it('ht=0 → 0 (garde-fou division par zéro)', () => {
    expect(snapVatRate(200, 0)).toBe(0)
  })

  it('tva=0 → 0 (exonéré / régime de la marge)', () => {
    expect(snapVatRate(0, 10000)).toBe(0)
  })

  it('5.5% : 1000 HT, 55 TVA → 5.5', () => {
    expect(snapVatRate(55, 1000)).toBe(5.5)
  })

  it('10% : 1000 HT, 100 TVA → 10', () => {
    expect(snapVatRate(100, 1000)).toBe(10)
  })

  it('19.9 raw → cale sur 20', () => {
    // 1990 / 10000 * 1000 = 199 → /10 = 19.9 → dist(20)=0.1 < dist(19)=0.9 → 20
    expect(snapVatRate(1990, 10000)).toBe(20)
  })

  it('19.1 raw → cale sur 19', () => {
    // 1910 / 10000 * 1000 = 191 → /10 = 19.1 → dist(19)=0.1 < dist(20)=0.9 → 19
    expect(snapVatRate(1910, 10000)).toBe(19)
  })

  it('taux atypique hors tolérance → conserve taux brut', () => {
    // 15% : dist(10)=5 > 1.5, dist(19)=4 > 1.5 → brut conservé
    expect(snapVatRate(150, 1000)).toBe(15)
  })
})
