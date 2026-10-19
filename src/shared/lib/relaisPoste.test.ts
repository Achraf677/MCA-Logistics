import { describe, expect, it } from 'vitest'
import { etatRelais, libellePlages, minutesParis, sitePosteDeLArret, jourParis } from './relaisPoste'

const arret = (commune: string, rue: string, numero: string | null) => ({ commune, rue, numero })

describe('sitePosteDeLArret', () => {
  it('reconnaît un point La Poste malgré accents, casse et ponctuation', () => {
    expect(sitePosteDeLArret(arret('Geudertheim', 'Rue du Général de Gaulle', '52'))?.id).toBe('12532A')
    expect(sitePosteDeLArret(arret('MOMMENHEIM', 'Route de Brumath', '37'))?.id).toBe('12585A')
    expect(sitePosteDeLArret(arret('Wingersheim les Quatre Bans', 'Rue de la 1ere Armee', '1'))?.id).toBe('12692A')
  })
  it('ignore les autres adresses (même rue, autre numéro ; relais Pickup)', () => {
    expect(sitePosteDeLArret(arret('Geudertheim', 'Rue du General de Gaulle', '50'))).toBeNull()
    expect(sitePosteDeLArret(arret('Kriegsheim', "Grand'Rue", '13'))).toBeNull()
    expect(sitePosteDeLArret(arret('Geudertheim', 'Rue du General de Gaulle', null))).toBeNull()
  })
})

describe('etatRelais', () => {
  const geudertheim = { plages: ['06:30-12:00', '15:00-18:45'], ferme: false }
  const t = (h: number, m = 0) => h * 60 + m
  it('ouvert jusqu’à la fin de la plage en cours', () => {
    expect(etatRelais(geudertheim, t(9))).toEqual({ etat: 'ouvert', texte: 'Ouvert jusqu’à 12 h' })
    expect(etatRelais(geudertheim, t(16))).toEqual({ etat: 'ouvert', texte: 'Ouvert jusqu’à 18 h 45' })
  })
  it('fermé entre deux plages : dit quand ça rouvre', () => {
    expect(etatRelais(geudertheim, t(13))).toEqual({ etat: 'ferme', texte: 'Fermé · ouvre à 15 h' })
    expect(etatRelais(geudertheim, t(5))).toEqual({ etat: 'ferme', texte: 'Fermé · ouvre à 6 h 30' })
  })
  it('fermé pour le reste de la journée', () => {
    expect(etatRelais(geudertheim, t(19))).toEqual({ etat: 'ferme', texte: 'Fermé pour aujourd’hui' })
  })
  it('la fin d’une plage est exclue (12 h pile = fermé)', () => {
    expect(etatRelais({ plages: ['10:00-12:00'], ferme: false }, t(12)).etat).toBe('ferme')
  })
  it('fermé toute la journée', () => {
    expect(etatRelais({ plages: [], ferme: true }, t(10))).toEqual({ etat: 'ferme_aujourdhui', texte: 'Fermé aujourd’hui' })
  })
})

describe('libellés et heure de Paris', () => {
  it('libellePlages', () => {
    expect(libellePlages(['06:30-12:00', '15:00-18:45'])).toBe('6 h 30-12 h · 15 h-18 h 45')
    expect(libellePlages(['09:00-12:30'])).toBe('9 h-12 h 30')
  })
  it('heure et jour de Paris (hiver / été)', () => {
    expect(minutesParis(new Date('2026-01-15T10:30:00Z'))).toBe(11 * 60 + 30)
    expect(minutesParis(new Date('2026-07-15T10:30:00Z'))).toBe(12 * 60 + 30)
    expect(jourParis(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
  })
})
