import { describe, it, expect } from 'vitest'
import { numeroUtilisable, lienSms, lienTel, MESSAGES_TYPES } from './messageClient'

describe('numeroUtilisable', () => {
  it('accepte un numéro français écrit avec des espaces', () => {
    expect(numeroUtilisable('06 12 34 56 78')).toBe(true)
  })
  it('accepte un format international', () => {
    expect(numeroUtilisable('+33 6 12 34 56 78')).toBe(true)
  })
  it('accepte un numéro allemand — MCA livre en Allemagne', () => {
    expect(numeroUtilisable('+49 721 1234567')).toBe(true)
  })
  it('refuse le vide et le trop court', () => {
    expect(numeroUtilisable(null)).toBe(false)
    expect(numeroUtilisable(undefined)).toBe(false)
    expect(numeroUtilisable('')).toBe(false)
    expect(numeroUtilisable('12345')).toBe(false)
    expect(numeroUtilisable('à rappeler')).toBe(false)
  })
})

describe('lienSms', () => {
  it('nettoie le numéro et encode le message', () => {
    expect(lienSms('06 12 34 56 78', 'Bonjour, j’arrive'))
      .toBe('sms:0612345678?body=Bonjour%2C%20j%E2%80%99arrive')
  })

  it('garde le + international', () => {
    expect(lienSms('+33 6 12 34 56 78', 'Salut')).toBe('sms:+33612345678?body=Salut')
  })

  it('utilise « ? » et jamais « & » avant body', () => {
    // La forme « &body= » ne marche que sur certains Android et casse sur iOS.
    const lien = lienSms('0612345678', 'x') as string
    expect(lien).toContain('?body=')
    expect(lien).not.toContain('&body=')
  })

  it('renvoie null sur un numéro inutilisable, pour masquer le bouton', () => {
    expect(lienSms(null, 'x')).toBeNull()
    expect(lienSms('néant', 'x')).toBeNull()
  })
})

describe('lienTel', () => {
  it('construit un lien d’appel nettoyé', () => {
    expect(lienTel('06.12.34.56.78')).toBe('tel:0612345678')
  })
  it('renvoie null sur un numéro inutilisable', () => {
    expect(lienTel('')).toBeNull()
  })
})

describe('MESSAGES_TYPES', () => {
  it('propose des messages non vides, avec des clés uniques', () => {
    const cles = MESSAGES_TYPES.map(m => m.cle)
    expect(new Set(cles).size).toBe(cles.length)
    for (const m of MESSAGES_TYPES) {
      expect(m.texte(null).length).toBeGreaterThan(10)
      expect(m.libelle.length).toBeGreaterThan(0)
    }
  })
})
