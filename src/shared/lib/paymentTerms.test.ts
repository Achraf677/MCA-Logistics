import { describe, it, expect } from 'vitest'
import {
  paymentTermDays, paymentTermLabel, defaultPaymentTermCode,
  resolvePaymentTermCode, computeDeadline, PAYMENT_TERM_OPTIONS,
} from './paymentTerms'

describe('PAYMENT_TERM_OPTIONS', () => {
  it('expose les libellés exacts attendus', () => {
    expect(PAYMENT_TERM_OPTIONS.map(o => o.label)).toEqual([
      'À réception', '15 jours', '30 jours', '45 jours', '60 jours', '30 jours fin de mois',
    ])
  })
})

describe('paymentTermDays', () => {
  it('mappe chaque code sur ses jours', () => {
    expect(paymentTermDays('reception')).toBe(0)
    expect(paymentTermDays('15')).toBe(15)
    expect(paymentTermDays('30')).toBe(30)
    expect(paymentTermDays('45')).toBe(45)
    expect(paymentTermDays('60')).toBe(60)
    expect(paymentTermDays('30_fin_mois')).toBe(30)
  })

  it('code inconnu/absent → 30 (fallback)', () => {
    expect(paymentTermDays(null)).toBe(30)
    expect(paymentTermDays(undefined)).toBe(30)
    expect(paymentTermDays('inexistant')).toBe(30)
  })
})

describe('paymentTermLabel', () => {
  it('retourne le libellé exact', () => {
    expect(paymentTermLabel('reception')).toBe('À réception')
    expect(paymentTermLabel('30_fin_mois')).toBe('30 jours fin de mois')
  })

  it('fallback "30 jours" si code inconnu', () => {
    expect(paymentTermLabel(null)).toBe('30 jours')
    expect(paymentTermLabel('xxx')).toBe('30 jours')
  })
})

describe('defaultPaymentTermCode', () => {
  it('dérive un code depuis un entier legacy', () => {
    expect(defaultPaymentTermCode(0)).toBe('reception')
    expect(defaultPaymentTermCode(15)).toBe('15')
    expect(defaultPaymentTermCode(30)).toBe('30')
    expect(defaultPaymentTermCode(45)).toBe('45')
    expect(defaultPaymentTermCode(60)).toBe('60')
  })

  it('ne renvoie jamais 30_fin_mois (indiscernable depuis un entier)', () => {
    expect(defaultPaymentTermCode(30)).toBe('30')
  })

  it('valeur non standard → fallback 30', () => {
    expect(defaultPaymentTermCode(7)).toBe('30')
  })
})

describe('resolvePaymentTermCode', () => {
  it('label renseigné → utilisé tel quel', () => {
    expect(resolvePaymentTermCode('30_fin_mois', 30)).toBe('30_fin_mois')
  })

  it('label absent (legacy) → dérivé de days', () => {
    expect(resolvePaymentTermCode(null, 30)).toBe('30')
    expect(resolvePaymentTermCode(undefined, 45)).toBe('45')
  })
})

describe('computeDeadline', () => {
  it('À réception → même jour', () => {
    expect(computeDeadline('reception', '2026-07-01')).toBe('2026-07-01')
  })

  it('30 jours → J+30', () => {
    expect(computeDeadline('30', '2026-07-01')).toBe('2026-07-31')
  })

  it('30 jours fin de mois → dernier jour du mois de J+30', () => {
    // 2026-07-01 + 30j = 2026-07-31 → fin de mois = 2026-07-31 (déjà dedans)
    expect(computeDeadline('30_fin_mois', '2026-07-01')).toBe('2026-07-31')
    // 2026-07-15 + 30j = 2026-08-14 → fin de mois = 2026-08-31
    expect(computeDeadline('30_fin_mois', '2026-07-15')).toBe('2026-08-31')
  })

  it('code absent → comportement 30 jours (fallback)', () => {
    expect(computeDeadline(null, '2026-07-01')).toBe('2026-07-31')
  })
})
