import { describe, it, expect } from 'vitest'
import {
  anomalies, construireSuivi, csvSuivi, ecartsPassage, filtrerSuivi, grouperSuivi, idsAnomalies, parVillage, passagesParHeure, totauxSuivi,
} from './suivi.logic'
import type { ArretColis, TourneeColis } from '../../shared/lib/tourneesColis'

const t = (p: Partial<TourneeColis> = {}): TourneeColis => ({
  id: 't1', company_id: 'c', member_id: 'm1', date: '2026-10-30', client_id: null, statut: 'en_cours', entete: null,
  created_by: null, created_at: '', updated_at: '', team_members: { full_name: 'ACHRAF CHIKRI' }, clients: null, ...p,
})
let n = 0
const a = (p: Partial<ArretColis> = {}): ArretColis => ({
  id: `a${++n}`, tournee_id: 't1', company_id: 'c', rang: n, commune: 'Kriegsheim', cp: '67170', rue: 'Rue A', numero: '1',
  type: 'c', quantite: 1, colis_remis: null, lat: null, lng: null, geo_precision: null, statut: null, statut_le: null,
  statut_par: null, note: null, ...p,
})
const le = (hhmm: string) => `2026-10-30T${hhmm}:00`

const base = () => {
  n = 0
  return [
    a({ commune: 'Kriegsheim', statut: 'livre', colis_remis: 1, statut_le: le('09:00') }),
    a({ commune: 'Kriegsheim', statut: 'avise', colis_remis: 0, statut_le: le('09:10') }),
    a({ commune: 'Brumath', zone: 'ZONE 1', quantite: 3, statut: 'livre', colis_remis: 2, statut_le: le('09:40') }),
    a({ commune: 'Brumath', zone: 'ZONE 1', type: 'col', statut: 'col_ok', statut_le: le('09:50') }),
    a({ commune: 'Brumath', zone: 'ZONE 2' }),
  ]
}

describe('construireSuivi / totaux', () => {
  it('une ligne par arrêt, colis remis et heure lus', () => {
    const l = construireSuivi([t()], base(), new Map([['a1', 2]]))
    expect(l).toHaveLength(5)
    expect(l[0].remis).toBe(1)
    expect(l[0].photos).toBe(2)
    expect(l[0].village).toBe('Kriegsheim')
    expect(l.find(x => x.villageCle.includes('zone 1'))?.village).toBe('Brumath · Zone 1')
  })

  it('arrêt d\'une tournée absente : ignoré', () => {
    expect(construireSuivi([t({ id: 'autre' })], base(), new Map())).toHaveLength(0)
  })

  it('totaux : livrés / avisés / collectes, premier et dernier passage, durée', () => {
    const tot = totauxSuivi(construireSuivi([t()], base(), new Map()))
    expect(tot.colisLivres).toBe(3)
    expect(tot.colisAttente).toBe(1 + 1)
    expect(tot.collectes).toBe(1)
    expect(tot.collectesTraitees).toBe(1)
    expect(tot.dureeMin).toBe(50)
  })
})

describe('parVillage / écarts / heures', () => {
  const lignes = () => construireSuivi([t()], base(), new Map())

  it('villages dans l\'ordre du premier passage, sans passage à la fin', () => {
    expect(parVillage(lignes()).map(g => g.libelle)).toEqual(['Kriegsheim', 'Brumath · Zone 1', 'Brumath · Zone 2'])
  })

  it('regroupement par tournée et par jour', () => {
    const deux = [t(), t({ id: 't2', date: '2026-10-29', team_members: { full_name: 'LUCAS' } })]
    const arrets = [...base(), a({ tournee_id: 't2' })]
    const l = construireSuivi(deux, arrets, new Map())
    expect(grouperSuivi(l, 'tournee').map(g => g.lignes.length)).toEqual([5, 1])
    expect(grouperSuivi(l, 'jour').map(g => g.lignes[0].date)).toEqual(['2026-10-30', '2026-10-29'])
  })

  it('totaux par village', () => {
    const g = parVillage(lignes())
    expect(g[0].arrets).toBe(2)
    expect(g[0].dureeMin).toBe(10)
    expect(g[2].premier).toBeNull()
  })

  it('écart avec le passage précédent de la même tournée', () => {
    const e = ecartsPassage(lignes())
    expect([...e.values()].sort((x, y) => x - y)).toEqual([10, 10, 30])
    expect(e.has('a1')).toBe(false)
  })

  it('passages par heure et par famille', () => {
    const h = passagesParHeure(lignes())
    expect(h.map(x => x.heure)).toEqual([9])
    expect(h[0].livre + h[0].attente + h[0].retour + h[0].neutre).toBe(4)
  })
})

describe('filtres', () => {
  const lignes = () => construireSuivi([t()], base(), new Map())
  const f = (p: Partial<Parameters<typeof filtrerSuivi>[1]> = {}) => ({ membreId: '', villageCle: '', statut: 'tous' as const, q: '', ...p })

  it('par statut', () => {
    expect(filtrerSuivi(lignes(), f({ statut: 'livres' }), new Set())).toHaveLength(2)
    expect(filtrerSuivi(lignes(), f({ statut: 'avises' }), new Set())).toHaveLength(1)
    expect(filtrerSuivi(lignes(), f({ statut: 'collectes' }), new Set())).toHaveLength(1)
    expect(filtrerSuivi(lignes(), f({ statut: 'non_traites' }), new Set())).toHaveLength(1)
  })

  it('par salarié, village et recherche', () => {
    expect(filtrerSuivi(lignes(), f({ membreId: 'autre' }), new Set())).toHaveLength(0)
    expect(filtrerSuivi(lignes(), f({ villageCle: 'kriegsheim' }), new Set())).toHaveLength(2)
    expect(filtrerSuivi(lignes(), f({ q: 'brumath' }), new Set())).toHaveLength(3)
  })

  it('anomalies : seulement les arrêts signalés', () => {
    const l = lignes()
    expect(filtrerSuivi(l, f({ statut: 'anomalies' }), new Set([l[0].id]))).toHaveLength(1)
  })
})

describe('anomalies', () => {
  it('rien d\'anormal : liste vide', () => {
    const tour = t({ statut: 'cloturee' })
    const arrets = [a({ statut: 'livre', colis_remis: 1, statut_le: le('09:00') })]
    expect(anomalies(construireSuivi([tour], arrets, new Map()), [tour], new Set(['t1']))).toEqual([])
  })

  it('détecte chaque incohérence', () => {
    n = 0
    const tour = t({ statut: 'cloturee' })
    const arrets = [
      a({ statut: 'livre', colis_remis: 1 }),
      a({ quantite: 3, statut: 'livre', colis_remis: 1, statut_le: le('09:00') }),
      a({ type: 'col' }),
      a({}),
    ]
    const r = anomalies(construireSuivi([tour], arrets, new Map()), [tour], new Set())
    expect(r.map(x => x.code)).toEqual(['sans_heure', 'partiel', 'collecte_ouverte', 'non_traite_cloture', 'sans_synthese'])
    expect(r[4].tourneeIds).toEqual(['t1'])
    expect(idsAnomalies(r).size).toBe(4)
  })

  it('tournée pas terminée : pas d\'anomalie de clôture', () => {
    n = 0
    const tour = t()
    const r = anomalies(construireSuivi([tour], [a({}), a({ type: 'col' })], new Map()), [tour], new Set())
    expect(r).toEqual([])
  })
})

describe('csvSuivi', () => {
  it('une ligne d\'en-tête + un arrêt par ligne, champs protégés', () => {
    n = 0
    const l = construireSuivi([t()], [a({ rue: 'Rue "A"; B', statut: 'livre', colis_remis: 1, statut_le: le('09:00') }), a({})], new Map())
    const csv = csvSuivi(l, new Map())
    const lignes = csv.split('\n')
    expect(lignes).toHaveLength(3)
    expect(lignes[1]).toContain('"1 Rue ""A""; B"')
    expect(lignes[2]).toContain('Non traité')
  })
})
