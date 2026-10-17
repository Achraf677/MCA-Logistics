import { describe, it, expect } from 'vitest'
import {
  grouperParCommune, prochainArret, statutsProposes, libelleAdresse, libelleCompteurs, lireColisRemis,
  patchStatut, compteursTournee,
} from './tourneeColis.logic'
import type { ArretColis } from '../../shared/lib/tourneesColis'

function a(p: Partial<ArretColis>): ArretColis {
  return {
    id: 'x', tournee_id: 't', company_id: 'c', rang: 1, commune: 'OSTWALD', cp: '67540', rue: 'RUE A',
    numero: '1', type: 'c', quantite: 1, colis_remis: null, lat: null, lng: null, geo_precision: null,
    statut: null, statut_le: null, statut_par: null, note: null, ...p,
  }
}

describe('grouperParCommune', () => {
  it('suit l’ordre de la feuille ; une commune qui revient = nouveau groupe', () => {
    const g = grouperParCommune([
      a({ id: '3', rang: 3, commune: 'OSTWALD' }),
      a({ id: '1', rang: 1, commune: 'OSTWALD', statut: 'livre' }),
      a({ id: '2', rang: 2, commune: 'ILLKIRCH', cp: '67400' }),
    ])
    expect(g.map(x => [x.commune, x.arrets.map(y => y.id), x.traites])).toEqual([
      ['OSTWALD', ['1'], 1], ['ILLKIRCH', ['2'], 0], ['OSTWALD', ['3'], 0],
    ])
    expect(new Set(g.map(x => x.cle)).size).toBe(3)
  })
})

describe('gestes', () => {
  it('prochain arrêt non traité, dans l’ordre', () => {
    expect(prochainArret([a({ id: '2', rang: 2 }), a({ id: '1', rang: 1, statut: 'livre' })])?.id).toBe('2')
    expect(prochainArret([a({ statut: 'livre' })])).toBeNull()
  })
  it('statuts proposés selon le type', () => {
    expect(statutsProposes('c').fait).toBe('livre')
    expect(statutsProposes('rc')).toEqual({ fait: 'rc_remis', autres: ['rc_ferme', 'rc_sature', 'acces'] })
    expect(statutsProposes('col').autres).toEqual(['col_rien', 'col_nf', 'acces'])
  })
  it('patch : livré = tout ou partiel borné ; autre = 0 ; effacer = null', () => {
    expect(patchStatut({ quantite: 3 }, 'livre')).toEqual({ statut: 'livre', colis_remis: 3 })
    expect(patchStatut({ quantite: 3 }, 'livre', 5)).toEqual({ statut: 'livre', colis_remis: 3 })
    expect(patchStatut({ quantite: 3 }, 'avise')).toEqual({ statut: 'avise', colis_remis: 0 })
    expect(patchStatut({ quantite: 3 }, null)).toEqual({ statut: null, colis_remis: null })
  })
  it('saisie colis remis', () => {
    expect(lireColisRemis('2', 3)).toBe(2)
    expect(lireColisRemis('7', 3)).toBe(3)
    expect(lireColisRemis('x', 3)).toBeNull()
    expect(lireColisRemis('', 3)).toBeNull()
  })
})

describe('libellés', () => {
  it('adresse et compteurs', () => {
    expect(libelleAdresse({ numero: '12', rue: 'RUE A' })).toBe('12 RUE A')
    expect(libelleAdresse({ numero: null, rue: 'RUE A' })).toBe('RUE A')
    const c = compteursTournee([a({ quantite: 2, statut: 'livre' }), a({ quantite: 3 })])
    expect(libelleCompteurs(c)).toEqual({ arrets: '1 / 2', colis: '2 / 5' })
  })
})
