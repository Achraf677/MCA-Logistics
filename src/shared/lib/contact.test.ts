import { describe, it, expect } from 'vitest'
import { telHref, mailtoHref } from './contact'

describe('telHref — normalisation', () => {
  it('retire espaces / points / tirets / parenthèses', () => {
    expect(telHref('06 12 34 56 78')).toBe('tel:0612345678')
    expect(telHref('06.12.34.56.78')).toBe('tel:0612345678')
    expect(telHref('06-12-34-56-78')).toBe('tel:0612345678')
    expect(telHref('(06) 12 34 56 78')).toBe('tel:0612345678')
  })
  it('conserve un + de tête (indicatif international)', () => {
    expect(telHref('+33 6 12 34 56 78')).toBe('tel:+33612345678')
  })
  it('null / vide / sans chiffre → null', () => {
    expect(telHref(null)).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref('   ')).toBeNull()
    expect(telHref('N/A')).toBeNull()
  })
})

describe('mailtoHref', () => {
  it('email valide', () => {
    expect(mailtoHref('contact@client.fr')).toBe('mailto:contact@client.fr')
    expect(mailtoHref('  a@b.com  ')).toBe('mailto:a@b.com')
  })
  it('null / vide / sans @ → null', () => {
    expect(mailtoHref(null)).toBeNull()
    expect(mailtoHref('')).toBeNull()
    expect(mailtoHref('pas-un-email')).toBeNull()
  })
})
