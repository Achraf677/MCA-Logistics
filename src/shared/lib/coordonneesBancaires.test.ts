import { describe, expect, it } from 'vitest'
import { ibanValide, bicValide, ibanLisible, erreursBancaires, emailMasque } from './coordonneesBancaires'

describe('coordonnées bancaires', () => {
  it('IBAN : clé mod 97', () => {
    expect(ibanValide('FR7630006000011234567890189')).toBe(true)
    expect(ibanValide('FR76 3000 6000 0112 3456 7890 189')).toBe(true)
    expect(ibanValide('FR7630006000011234567890188')).toBe(false)
    expect(ibanValide('FR76')).toBe(false)
  })
  it('BIC : 8 ou 11 caractères', () => {
    expect(bicValide('QNTOFRP1XXX')).toBe(true)
    expect(bicValide('AGRIFRPP')).toBe(true)
    expect(bicValide('ABC')).toBe(false)
  })
  it('lecture par groupes de 4', () => {
    expect(ibanLisible('fr7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189')
  })
  it('champ vide : pas d’erreur ; champ faux : erreur', () => {
    expect(erreursBancaires({ iban: null, bic: '' })).toEqual({})
    expect(Object.keys(erreursBancaires({ iban: 'FR00', bic: 'x' }))).toEqual(['iban', 'bic'])
  })
  it('e-mail masqué', () => {
    expect(emailMasque('depot@fictif.example')).toBe('de•••@fictif.example')
    expect(emailMasque('ab@x.fr')).toBe('ab•••@x.fr')
    expect(emailMasque('pas-un-mail')).toBe('pas-un-mail')
  })
})
