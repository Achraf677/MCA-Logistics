import { describe, it, expect } from 'vitest'
import { autoliquidationParDefaut, estUE, libellePays } from './pays'

describe('pays', () => {
  it('autoliquidation : UE hors France + n° de TVA', () => {
    expect(autoliquidationParDefaut('RO', 'RO123')).toBe(true)
    expect(autoliquidationParDefaut('RO', '')).toBe(false)
    expect(autoliquidationParDefaut('FR', 'FR123')).toBe(false)
    expect(autoliquidationParDefaut('CH', 'CHE123')).toBe(false)
    expect(autoliquidationParDefaut(null, 'X')).toBe(false)
  })
  it('libellés', () => {
    expect(estUE('de')).toBe(true)
    expect(libellePays('DE')).toBe('Allemagne')
    expect(libellePays('ZZ')).toBe('ZZ')
  })
})
