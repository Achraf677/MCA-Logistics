import { describe, expect, it } from 'vitest'
import {
  ibanValide, bicValide, cleTvaFr, tvaValide, erreursSociete, avertissementsSociete,
  completudeSociete, echeanceSociete, libelleEcheance, champsModifies,
} from './parametres.logic'

const ok = { name: 'MCA Fictive', siren: '123456789', siret: '12345678900012', tva_intra: 'FR32123456789', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP', pennylane_depot_email: 'depot@fictif.example' }

describe('contrôles de saisie', () => {
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
  it('TVA française : clé calculée', () => {
    expect(cleTvaFr('123456789')).toBe('32')
    expect(tvaValide('FR32123456789')).toBe(true)
    expect(tvaValide('FR 32 123456789')).toBe(true)
    expect(tvaValide('FR99123456789')).toBe(false)
    expect(tvaValide('DE123456789')).toBe(true)
  })
  it('une fiche correcte ne donne aucune erreur ; les champs vides ne sont pas des erreurs', () => {
    expect(erreursSociete(ok)).toEqual({})
    expect(erreursSociete({ name: 'X', siren: null, siret: null, tva_intra: null, iban: null, bic: null, pennylane_depot_email: null })).toEqual({})
  })
  it('chaque champ faux est signalé', () => {
    const e = erreursSociete({ name: ' ', siren: '12', siret: '1', tva_intra: 'FR00', iban: 'FR00', bic: 'x', pennylane_depot_email: 'pas-un-mail' })
    expect(Object.keys(e).sort()).toEqual(['bic', 'iban', 'name', 'pennylane_depot_email', 'siren', 'siret', 'tva_intra'])
  })
  it('avertit si SIRET ou TVA ne reprennent pas le SIREN', () => {
    expect(avertissementsSociete(ok)).toEqual([])
    expect(avertissementsSociete({ ...ok, siret: '99999999900012' })).toHaveLength(1)
    expect(avertissementsSociete({ ...ok, tva_intra: 'FR32999999999' })).toHaveLength(1)
  })
})

describe('complétude et échéances', () => {
  it('compte les champs vides', () => {
    const r = completudeSociete({ name: 'X', siren: '', iban: null })
    expect(r.remplis).toBe(1)
    expect(r.manquants).toContain('IBAN')
    expect(r.total).toBe(12)
  })
  it('échéance : voyant à 60 jours', () => {
    const jour = new Date(2026, 9, 29)
    expect(echeanceSociete('2026-11-30', jour).status).toBe('soon')
    expect(echeanceSociete('2027-06-05', jour).status).toBe('ok')
    expect(echeanceSociete('2026-10-01', jour).status).toBe('overdue')
    expect(libelleEcheance(echeanceSociete('2026-11-30', jour))).toBe('Dans 32 j')
    expect(libelleEcheance(echeanceSociete(null, jour))).toBe('Non renseignée')
  })
  it('champs modifiés', () => {
    expect(champsModifies({ a: 'x', b: null }, { a: 'x', b: null })).toEqual([])
    expect(champsModifies({ a: 'x', b: null }, { a: 'y', b: 'z' })).toEqual(['a', 'b'])
  })
})
