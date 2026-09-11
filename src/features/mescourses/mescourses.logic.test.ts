import { describe, it, expect } from 'vitest'
import {
  bornesPeriode, decalerPeriode, libellePeriode,
  grouperParJour, estAFaire, resteAFaire,
} from './mescourses.logic'

describe('bornesPeriode', () => {
  it('jour : début = fin = la date elle-même', () => {
    expect(bornesPeriode('2026-09-11', 'jour')).toEqual({ debut: '2026-09-11', fin: '2026-09-11' })
  })

  it('semaine : du lundi au dimanche', () => {
    // 11/09/2026 est un vendredi.
    expect(bornesPeriode('2026-09-11', 'semaine'))
      .toEqual({ debut: '2026-09-07', fin: '2026-09-13' })
  })

  it('semaine : un lundi est son propre début', () => {
    expect(bornesPeriode('2026-09-07', 'semaine').debut).toBe('2026-09-07')
  })

  it('semaine : un dimanche appartient à la semaine qui commence le lundi précédent', () => {
    // Piège classique : getDay() met le dimanche à 0, donc sans correction
    // le dimanche ouvrirait une nouvelle semaine.
    expect(bornesPeriode('2026-09-13', 'semaine'))
      .toEqual({ debut: '2026-09-07', fin: '2026-09-13' })
  })

  it('semaine : à cheval sur deux mois', () => {
    expect(bornesPeriode('2026-10-01', 'semaine'))
      .toEqual({ debut: '2026-09-28', fin: '2026-10-04' })
  })

  it('mois : du 1er au dernier jour, y compris février bissextile', () => {
    expect(bornesPeriode('2026-09-11', 'mois')).toEqual({ debut: '2026-09-01', fin: '2026-09-30' })
    expect(bornesPeriode('2026-02-15', 'mois')).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesPeriode('2028-02-15', 'mois')).toEqual({ debut: '2028-02-01', fin: '2028-02-29' })
  })

  it('date invalide : renvoyée telle quelle plutôt que NaN', () => {
    expect(bornesPeriode('pas-une-date', 'mois')).toEqual({ debut: 'pas-une-date', fin: 'pas-une-date' })
  })
})

describe('decalerPeriode', () => {
  it('jour : ±1 jour, passage de mois compris', () => {
    expect(decalerPeriode('2026-09-11', 'jour', 1)).toBe('2026-09-12')
    expect(decalerPeriode('2026-09-01', 'jour', -1)).toBe('2026-08-31')
  })

  it('semaine : ±7 jours', () => {
    expect(decalerPeriode('2026-09-11', 'semaine', 1)).toBe('2026-09-18')
    expect(decalerPeriode('2026-09-11', 'semaine', -1)).toBe('2026-09-04')
  })

  it('mois : se cale sur le 1er, sans déborder sur le mois suivant', () => {
    // Le piège : 31 janvier − 1 mois donnerait « 31 février », que JavaScript
    // convertit en 2 ou 3 mars. On ancre au 1er pour l'éviter.
    expect(decalerPeriode('2026-01-31', 'mois', -1)).toBe('2025-12-01')
    expect(decalerPeriode('2026-03-31', 'mois', -1)).toBe('2026-02-01')
    expect(decalerPeriode('2026-12-15', 'mois', 1)).toBe('2027-01-01')
  })

  it('delta 0 : mois ramené au 1er, jour et semaine inchangés', () => {
    expect(decalerPeriode('2026-09-11', 'jour', 0)).toBe('2026-09-11')
    expect(decalerPeriode('2026-09-11', 'semaine', 0)).toBe('2026-09-11')
    expect(decalerPeriode('2026-09-11', 'mois', 0)).toBe('2026-09-01')
  })

  it('aller-retour : avancer puis reculer revient au point de départ', () => {
    for (const mode of ['jour', 'semaine'] as const) {
      const apres = decalerPeriode('2026-09-11', mode, 1)
      expect(decalerPeriode(apres, mode, -1)).toBe('2026-09-11')
    }
  })
})

describe('libellePeriode', () => {
  it('jour : jour de semaine complet', () => {
    expect(libellePeriode('2026-09-11', 'jour')).toContain('septembre')
    expect(libellePeriode('2026-09-11', 'jour')).toContain('2026')
  })

  it('semaine dans le même mois : le mois n’est écrit qu’une fois', () => {
    const l = libellePeriode('2026-09-11', 'semaine')
    expect(l).toBe('7 – 13 septembre 2026')
  })

  it('semaine à cheval : les deux mois sont écrits', () => {
    const l = libellePeriode('2026-10-01', 'semaine')
    expect(l).toContain('sept')
    expect(l).toContain('oct')
  })

  it('mois : mois et année', () => {
    expect(libellePeriode('2026-09-11', 'mois')).toBe('septembre 2026')
  })
})

describe('grouperParJour', () => {
  it('regroupe et trie les jours du plus ancien au plus récent', () => {
    const courses = [
      { date: '2026-09-12', id: 'c' },
      { date: '2026-09-11', id: 'a' },
      { date: '2026-09-12', id: 'd' },
      { date: '2026-09-11', id: 'b' },
    ]
    const groupes = grouperParJour(courses)
    expect(groupes.map(([j]) => j)).toEqual(['2026-09-11', '2026-09-12'])
    // Ordre d'entrée préservé à l'intérieur d'un jour.
    expect(groupes[0][1].map(c => c.id)).toEqual(['a', 'b'])
    expect(groupes[1][1].map(c => c.id)).toEqual(['c', 'd'])
  })

  it('liste vide → aucun groupe', () => {
    expect(grouperParJour([])).toEqual([])
  })
})

describe('estAFaire / resteAFaire', () => {
  it('planifiée et en cours restent à faire ; livrée, facturée, payée, annulée non', () => {
    expect(estAFaire('planifiee')).toBe(true)
    expect(estAFaire('en_cours')).toBe(true)
    expect(estAFaire('livree')).toBe(false)
    expect(estAFaire('facturee')).toBe(false)
    expect(estAFaire('payee')).toBe(false)
    expect(estAFaire('annulee')).toBe(false)
  })

  it('compte le reste et le total', () => {
    expect(resteAFaire([
      { statut: 'planifiee' }, { statut: 'livree' }, { statut: 'en_cours' }, { statut: 'annulee' },
    ])).toEqual({ reste: 2, total: 4 })
    expect(resteAFaire([])).toEqual({ reste: 0, total: 0 })
  })
})
