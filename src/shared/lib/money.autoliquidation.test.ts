import { describe, it, expect } from 'vitest'
import { deliveryTotalTtcCts } from './money'

describe('deliveryTotalTtcCts — autoliquidation', () => {
  const row = { amount_ttc_cts: 10000, extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 1000, tva_rate: 20 }] }
  it('compte la TVA des suppléments hors autoliquidation', () => {
    expect(deliveryTotalTtcCts(row)).toBe(11200)
  })
  it('aucune TVA sur les suppléments en autoliquidation (comme l’Edge)', () => {
    expect(deliveryTotalTtcCts({ ...row, autoliquidation: true })).toBe(11000)
  })
})
