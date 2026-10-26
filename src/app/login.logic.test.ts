import { describe, it, expect } from 'vitest'
import { pauseSecondes, apresEchec, secondesRestantes, formaterDuree, messageErreur, emailPlausible } from './login.logic'

describe('pauseSecondes', () => {
  it('aucune pause avant 5 échecs', () => {
    expect(pauseSecondes(0)).toBe(0)
    expect(pauseSecondes(4)).toBe(0)
  })
  it('croît puis plafonne à 30 min', () => {
    expect(pauseSecondes(5)).toBe(30)
    expect(pauseSecondes(6)).toBe(60)
    expect(pauseSecondes(10)).toBe(1800)
    expect(pauseSecondes(99)).toBe(1800)
  })
})

describe('apresEchec', () => {
  it('pose la fin de pause au 5e échec seulement', () => {
    expect(apresEchec({ echecs: 3, jusqua: 0 }, 1000)).toEqual({ echecs: 4, jusqua: 0 })
    expect(apresEchec({ echecs: 4, jusqua: 0 }, 1000)).toEqual({ echecs: 5, jusqua: 31000 })
  })
})

describe('secondesRestantes / formaterDuree', () => {
  it('arrondit au supérieur et ne descend pas sous 0', () => {
    expect(secondesRestantes({ echecs: 5, jusqua: 10500 }, 10000)).toBe(1)
    expect(secondesRestantes({ echecs: 5, jusqua: 5000 }, 10000)).toBe(0)
  })
  it('formate', () => {
    expect(formaterDuree(45)).toBe('45 s')
    expect(formaterDuree(120)).toBe('2 min')
    expect(formaterDuree(125)).toBe('2 min 05 s')
  })
})

describe('messageErreur', () => {
  it('même message pour e-mail inconnu et mauvais mot de passe', () => {
    expect(messageErreur({ message: 'Invalid login credentials' })).toBe('E-mail ou mot de passe incorrect.')
  })
  it('429 = trop de tentatives', () => {
    expect(messageErreur({ status: 429, message: 'x' })).toMatch(/Trop de tentatives/)
  })
  it('garde le message du verrou serveur', () => {
    expect(messageErreur({ message: 'Compte verrouillé pendant 15 min.' })).toBe('Compte verrouillé pendant 15 min.')
  })
})

describe('emailPlausible', () => {
  it('valide la forme', () => {
    expect(emailPlausible('a@b.fr')).toBe(true)
    expect(emailPlausible('a@b')).toBe(false)
    expect(emailPlausible('')).toBe(false)
  })
})
