import { describe, it, expect } from 'vitest'
import {
  statutsProposes, issueRapide, libelleAdresse, libelleCompteurs, lireColisRemis,
  patchStatut, compteursTournee, peutTransformer, colisCollecteDefaut, resultatCollecte, appliquerEclatement,
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

describe('collecte : transformer / éclater', () => {
  it('seuls les arrêts non traités, domicile ou collecte, se transforment', () => {
    expect(peutTransformer({ type: 'c', statut: null })).toBe(true)
    expect(peutTransformer({ type: 'col', statut: null })).toBe(true)
    expect(peutTransformer({ type: 'rc', statut: null })).toBe(false)
    expect(peutTransformer({ type: 'c', statut: 'livre' })).toBe(false)
  })

  it('1 colis : tout en collecte ; plusieurs : 1 par défaut', () => {
    expect(colisCollecteDefaut(1)).toBe(1)
    expect(colisCollecteDefaut(4)).toBe(1)
  })

  it('résultat du choix : total conservé', () => {
    expect(resultatCollecte(1, 1)).toEqual({ mode: 'tout', collecte: 1, normal: 0 })
    expect(resultatCollecte(3, 1)).toEqual({ mode: 'eclate', collecte: 1, normal: 2 })
    expect(resultatCollecte(3, 3)).toEqual({ mode: 'tout', collecte: 3, normal: 0 })
    expect(resultatCollecte(3, 9)).toEqual({ mode: 'tout', collecte: 3, normal: 0 })
    expect(resultatCollecte(3, 0)).toEqual({ mode: 'eclate', collecte: 1, normal: 2 })
  })

  it('éclatement : nouvel arrêt juste derrière, rangs suivants décalés, autre tournée intacte', () => {
    const base = [a({ id: '1', rang: 1, quantite: 3 }), a({ id: '2', rang: 2 }), a({ id: '3', rang: 3 }), a({ id: 'z', tournee_id: 'autre', rang: 2 })]
    const maj = [a({ id: '1', rang: 1, quantite: 2 }), a({ id: 'n', rang: 2, quantite: 1, type: 'col' })]
    const r = appliquerEclatement(base, maj)
    const ordre = r.filter(x => x.tournee_id === base[0].tournee_id).map(x => [x.id, x.rang])
    expect(ordre).toEqual([['1', 1], ['n', 2], ['2', 3], ['3', 4]])
    expect(r.find(x => x.id === 'z')?.rang).toBe(2)
    expect(r.filter(x => x.tournee_id === base[0].tournee_id).reduce((s, x) => s + x.quantite, 0)).toBe(2 + 1 + 1 + 1)
  })

  it('simple mise à jour sans nouvel arrêt : remplace', () => {
    const r = appliquerEclatement([a({ id: '1' })], [a({ id: '1', type: 'col' })])
    expect(r[0].type).toBe('col')
  })
})
