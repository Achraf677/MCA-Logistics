import { describe, it, expect } from 'vitest'
import { toLocalISO } from './dates'

describe('toLocalISO', () => {
  it('formate une date locale sans décalage UTC', () => {
    expect(toLocalISO(new Date(2026, 5, 6))).toBe('2026-06-06')
  })

  it('formate le 1er janvier', () => {
    expect(toLocalISO(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('formate le 31 décembre avec padding mois et jour', () => {
    expect(toLocalISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
