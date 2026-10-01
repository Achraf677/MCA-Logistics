import { describe, it, expect } from 'vitest'
import { lireSupplements } from './supplements'

describe('lireSupplements', () => {
  it('nettoie, dédoublonne, refuse le non-tableau', () => {
    expect(lireSupplements(null)).toEqual([])
    expect(lireSupplements([
      { label: ' Attente ', prix_ht_cts: 1500 }, { label: 'attente', prix_ht_cts: 1 },
      { label: '', prix_ht_cts: 9 }, { label: 'Étage', prix_ht_cts: -3 },
    ])).toEqual([{ label: 'Attente', prix_ht_cts: 1500 }, { label: 'Étage', prix_ht_cts: 0 }])
  })
})
