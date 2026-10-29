import { describe, it, expect } from 'vitest'
import { afficherChromeSalarie } from './apercuSalarie'

describe('aperçu salarié', () => {
  it('vrai compte salarié : toujours le chrome salarié', () => {
    expect(afficherChromeSalarie(true, false, '/mes-courses')).toBe(true)
  })
  it('bureau : seulement en aperçu et sur Mes courses', () => {
    expect(afficherChromeSalarie(false, true, '/mes-courses')).toBe(true)
    expect(afficherChromeSalarie(false, true, '/finance')).toBe(false)
    expect(afficherChromeSalarie(false, false, '/mes-courses')).toBe(false)
  })
})
