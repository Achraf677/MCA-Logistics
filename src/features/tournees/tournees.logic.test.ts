import { describe, it, expect } from 'vitest'
import {
  arretsRestants, construireLignes, csvTournees, dateDepuisParam, decalerJour, filtrerTournees, resumeTournees,
} from './tournees.logic'
import type { ArretColis, TourneeColis } from '../../shared/lib/tourneesColis'

const tournee = (id: string, over: Partial<TourneeColis> = {}) => ({
  id, member_id: `m-${id}`, statut: 'a_faire', trajet: null,
  team_members: { full_name: `Salarié ${id}` }, clients: { name: 'Colissimo' }, ...over,
}) as unknown as TourneeColis
const arret = (tournee_id: string, over: Partial<ArretColis> = {}) => ({
  tournee_id, type: 'c', quantite: 1, statut: null, colis_remis: null, en_pause_le: null, ...over,
}) as unknown as ArretColis

const lignes = construireLignes(
  [tournee('a', { statut: 'en_cours', trajet: { km_total: 12.5 } as never }), tournee('b', { statut: 'cloturee' })],
  [
    arret('a', { statut: 'livre', quantite: 2 }), arret('a', { statut: 'avise' }), arret('a', { en_pause_le: '2026-10-22T08:00:00Z' }),
    arret('b', { statut: 'refuse' }),
  ],
)

describe('résumé du jour', () => {
  it('additionne colis, retours, pauses et km', () => {
    const r = resumeTournees(lignes)
    expect(r).toMatchObject({ tournees: 2, enCours: 1, cloturees: 1, colis: 5, colisLivres: 2, colisAttente: 1, colisRetour: 1, enPause: 1, km: 12.5 })
    expect(r.pct).toBe(75)
  })
  it('jour sans tournée : tout à zéro', () => {
    expect(resumeTournees([])).toMatchObject({ tournees: 0, colis: 0, pct: 0 })
  })
})

describe('filtres', () => {
  it('par tuile', () => {
    expect(filtrerTournees(lignes, 'en_cours', '', '').map(l => l.t.id)).toEqual(['a'])
    expect(filtrerTournees(lignes, 'cloturees', '', '').map(l => l.t.id)).toEqual(['b'])
    expect(filtrerTournees(lignes, 'retours', '', '').map(l => l.t.id)).toEqual(['b'])
    expect(filtrerTournees(lignes, 'attente', '', '').map(l => l.t.id)).toEqual(['a'])
  })
  it('par salarié et recherche', () => {
    expect(filtrerTournees(lignes, 'toutes', 'm-b', '').map(l => l.t.id)).toEqual(['b'])
    expect(filtrerTournees(lignes, 'toutes', '', 'salarié a').map(l => l.t.id)).toEqual(['a'])
  })
})

describe('export CSV', () => {
  it('une ligne par tournée, virgule décimale', () => {
    const lignesCsv = csvTournees(lignes, '2026-10-22').split('\n')
    expect(lignesCsv).toHaveLength(3)
    expect(lignesCsv[1]).toBe('2026-10-22;Salarié a;Colissimo;En cours;3;2;4;2;1;0;0;1;12,5')
  })
})

describe('divers', () => {
  it('arrêts restants : ni traités ni collectes', () => {
    expect(arretsRestants([arret('a'), arret('a', { statut: 'livre' }), arret('a', { type: 'col' })])).toBe(1)
  })
  it('date en paramètre', () => {
    expect(dateDepuisParam('2026-10-22')).toBe('2026-10-22')
    expect(dateDepuisParam('2026-02-31')).toBeNull()
    expect(dateDepuisParam('abc')).toBeNull()
  })
  it('décaler un jour, passage de mois', () => {
    expect(decalerJour('2026-10-31', 1)).toBe('2026-11-01')
    expect(decalerJour('2026-03-01', -1)).toBe('2026-02-28')
  })
})
