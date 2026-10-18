import { describe, it, expect } from 'vitest'
import {
  statutsProposes, issueRapide, libelleAdresse, libelleCompteurs, lireColisRemis,
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

describe('gestes', () => {
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
    expect(patchStatut({ quantite: 2 }, 'col_rien', 2)).toEqual({ statut: 'col_rien', colis_remis: 0 })
    expect(patchStatut({ quantite: 2 }, 'acces')).toEqual({ statut: 'acces', colis_remis: 0 })
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

describe('issue rapide (un appui après « fait »)', () => {
  it('avisé · relais fermé · rien à collecter', () => {
    expect(issueRapide('c')).toBe('avise')
    expect(issueRapide('rc')).toBe('rc_ferme')
    expect(issueRapide('col')).toBe('col_rien')
  })
})
