import { describe, it, expect } from 'vitest'
import { soldePennylane } from './tresorerie.logic'


describe('soldePennylane', () => {
  it('somme les comptes de la dernière synchro seulement', () => {
    const rows = [
      { balance_cts: 1000, fetched_at: '2026-10-29T10:00:30Z' },
      { balance_cts: 500, fetched_at: '2026-10-29T10:00:00Z' },
      { balance_cts: 9999, fetched_at: '2026-10-28T10:00:00Z' },
    ]
    expect(soldePennylane(rows)).toBe(1500)
    expect(soldePennylane([])).toBeNull()
  })
})
