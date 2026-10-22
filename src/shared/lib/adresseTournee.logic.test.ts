import { describe, it, expect } from 'vitest'
import type { ArretColis } from './tourneesColis'
import { rechercherArrets, analyserSaisie, zoneDeLaRue, cpDeLaCommune } from './adresseTournee.logic'

const a = (p: Partial<ArretColis>) => ({ id: 'x', commune: 'BRUMATH', rue: 'rue des Roses', numero: '12', cp: '67170', zone: 'ZONE 3', ...p }) as ArretColis
const liste = [a({ id: '1' }), a({ id: '2', numero: '120', rue: 'avenue de Strasbourg' }), a({ id: '3', commune: 'KRIEGSHEIM', numero: '5', rue: "Grand'Rue", zone: null, cp: '67170' })]

describe('rechercherArrets', () => {
  it('mots dans n\'importe quel ordre, accents ignorés', () => {
    expect(rechercherArrets(liste, 'roses 12').map(x => x.id)).toEqual(['1'])
    expect(rechercherArrets(liste, 'STRASBOURG').map(x => x.id)).toEqual(['2'])
    expect(rechercherArrets(liste, 'kriegs').map(x => x.id)).toEqual(['3'])
  })
  it('le numéro 12 ne ramène pas 120 sauf préfixe', () => {
    expect(rechercherArrets(liste, '12').map(x => x.id)).toEqual(['1', '2'])
  })
  it('rien tapé = rien', () => expect(rechercherArrets(liste, '  ')).toEqual([]))
})

describe('analyserSaisie', () => {
  it('numéro + rue', () => expect(analyserSaisie('12 rue des Roses')).toEqual({ numero: '12', rue: 'rue des Roses' }))
  it('numéro avec lettre', () => expect(analyserSaisie('7b rue du Stade')).toEqual({ numero: '7B', rue: 'rue du Stade' }))
  it('sans numéro', () => expect(analyserSaisie('rue des Roses')).toEqual({ numero: '', rue: 'rue des Roses' }))
})

describe('reprises', () => {
  it('zone et code postal repris de la tournée, sinon null', () => {
    expect(zoneDeLaRue(liste, 'brumath', 'Rue des roses')).toBe('ZONE 3')
    expect(zoneDeLaRue(liste, 'brumath', 'rue inconnue')).toBeNull()
    expect(cpDeLaCommune(liste, 'Kriegsheim')).toBe('67170')
    expect(cpDeLaCommune(liste, 'Ohlungen')).toBeNull()
  })
})
