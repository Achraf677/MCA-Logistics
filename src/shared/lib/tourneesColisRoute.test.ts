import { describe, it, expect } from 'vitest'
import {
  arretsDansOrdre, prochainDansOrdre, sectionsListe, arretsAPlacer, deplacer, ordreManuel, libelleDuree, libelleDistance,
  bandeauOrdre, heurePassage, pointsCarte, couperTrace, doitEnvoyerPosition, ilYA, positionAncienne,
  journeeDepuisArrets, nonTraites, modeOrdre,
} from './tourneesColisRoute'
import type { ArretColis, TrajetTournee } from './tourneesColis'

function a(p: Partial<ArretColis>): ArretColis {
  return {
    id: 'x', tournee_id: 't', company_id: 'c', rang: 1, commune: 'OSTWALD', cp: '67540', rue: 'RUE A',
    numero: '1', type: 'c', quantite: 1, colis_remis: null, lat: 48.5, lng: 7.7, geo_precision: 'numero',
    statut: null, statut_le: null, statut_par: null, note: null, ordre: null, eta_min: null, ...p,
  }
}

const trajet = (p: Partial<TrajetTournee> = {}): TrajetTournee => ({
  polyline: '', approximatif: false, km_total: 52, km_feuille: 70, duree_min: 220, mode: 'tout',
  depart: { lat: 48.5, lng: 7.7 }, arrivee: 'depart', calcule_a: '2026-10-18T06:00:00.000Z', ...p,
})

describe('ordre affiché', () => {
  const liste = [a({ id: '1', rang: 1, ordre: 3 }), a({ id: '2', rang: 2, ordre: 1 }), a({ id: '3', rang: 3, ordre: null }), a({ id: '4', rang: 4, ordre: 2, statut: 'livre' })]
  it('feuille = rang ; route = ordre, non placés à la fin', () => {
    expect(arretsDansOrdre(liste, 'feuille').map(x => x.id)).toEqual(['1', '2', '3', '4'])
    expect(arretsDansOrdre(liste, 'route').map(x => x.id)).toEqual(['2', '4', '1', '3'])
  })
  it('prochain = premier non traité dans l’ordre', () => {
    expect(prochainDansOrdre(liste, 'route')?.id).toBe('2')
    expect(prochainDansOrdre([a({ statut: 'livre' })], 'route')).toBeNull()
  })
  it('sections : à faire groupés par commune à chaque changement, traités à part', () => {
    const s = sectionsListe([
      a({ id: '1', ordre: 1, commune: 'A' }), a({ id: '2', ordre: 2, commune: 'B' }),
      a({ id: '3', ordre: 3, commune: 'A' }), a({ id: '4', ordre: 4, commune: 'A', statut: 'refuse' }),
    ], 'route')
    expect(s.aFaire.map(g => [g.commune, g.arrets.map(x => x.id)])).toEqual([['A', ['1']], ['B', ['2']], ['A', ['3']]])
    expect(s.traites.map(x => x.id)).toEqual(['4'])
  })
  it('à placer : sans position et non traité', () => {
    expect(arretsAPlacer([a({ id: '1', lat: null, lng: null }), a({ id: '2' }), a({ id: '3', lat: null, statut: 'livre' })]).map(x => x.id)).toEqual(['1'])
  })
  it('glisser-déposer et ordre manuel (traités devant)', () => {
    expect(deplacer(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(deplacer(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(ordreManuel(liste, 'route', ['3', '1', '2'])).toEqual(['4', '3', '1', '2'])
  })
  it('mode inconnu = feuille', () => {
    expect(modeOrdre({ ordre_mode: null })).toBe('feuille')
    expect(modeOrdre({ ordre_mode: 'manuel' })).toBe('manuel')
  })
})

describe('libellés', () => {
  it('durée et distance', () => {
    expect(libelleDuree(45)).toBe('45 min')
    expect(libelleDuree(120)).toBe('2 h')
    expect(libelleDuree(220)).toBe('3 h 40')
    expect(libelleDistance(820)).toBe('820 m')
    expect(libelleDistance(3420)).toBe('3,4 km')
    expect(libelleDistance(52_300)).toBe('52 km')
  })
  it('bandeau', () => {
    expect(bandeauOrdre({ ordre_mode: 'feuille', trajet: null }).titre).toBe('Ordre de la feuille')
    const b = bandeauOrdre({ ordre_mode: 'route', trajet: trajet() })
    expect(b).toEqual({ titre: 'Ordre par la route', detail: '52 km · 3 h 40 · 18 km de moins que la feuille', avertissement: null })
    expect(bandeauOrdre({ ordre_mode: 'route', trajet: trajet({ approximatif: true }) }).avertissement).toMatch(/approximatif/)
    expect(bandeauOrdre({ ordre_mode: 'manuel', trajet: trajet() }).titre).toBe('Ordre manuel')
    expect(bandeauOrdre({ ordre_mode: 'route', trajet: trajet({ trace_droit: true }) }).avertissement).toMatch(/ligne droite/)
  })
  it('heure de passage : départ de la feuille, sinon heure du calcul', () => {
    const t = { date: '2026-10-18', entete: { depart: '08:15' }, trajet: trajet() }
    expect(heurePassage(t, 30)).toBe('08:45')
    expect(heurePassage({ ...t, trajet: null }, 30)).toBeNull()
    const r = heurePassage({ ...t, trajet: trajet({ mode: 'restants', calcule_a: new Date(2026, 9, 18, 11, 0).toISOString() }) }, 12)
    expect(r).toBe('11:12')
  })
})

describe('carte', () => {
  it('même point = une pastille ; état, prochain, type, hors ordre', () => {
    const p = pointsCarte([
      a({ id: '1', ordre: 1, statut: 'livre' }), a({ id: '2', ordre: 2 }),
      a({ id: '3', ordre: 3, lat: 48.6, type: 'rc', statut: 'refuse' }),
      a({ id: '4', ordre: null, lat: 48.7 }), a({ id: '5', lat: null, lng: null }),
    ], 'route', '2')
    expect(p).toHaveLength(3)
    expect(p[0]).toMatchObject({ numero: 2, etat: 'a_faire', prochain: true, horsOrdre: false })
    expect(p[0].arrets).toHaveLength(2)
    expect(p[1]).toMatchObject({ etat: 'retour', type: 'rc', prochain: false })
    expect(p[2]).toMatchObject({ horsOrdre: true, numero: null })
  })
  it('tracé coupé au prochain arrêt', () => {
    const l: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [0, 3]]
    expect(couperTrace(l, { lat: 0, lng: 2 }, false)).toEqual({ fait: [[0, 0], [0, 1], [0, 2]], reste: [[0, 2], [0, 3]] })
    expect(couperTrace(l, null, true).reste).toEqual([])
    expect(couperTrace(l, null, false).fait).toEqual([])
  })
})

describe('suivi en direct', () => {
  it('position : 30 s, ou 150 m après 10 s', () => {
    const d = { t: 0, lat: 48.5, lng: 7.7 }
    expect(doitEnvoyerPosition(null, 0, d)).toBe(true)
    expect(doitEnvoyerPosition(d, 20_000, d)).toBe(false)
    expect(doitEnvoyerPosition(d, 30_000, d)).toBe(true)
    expect(doitEnvoyerPosition(d, 12_000, { lat: 48.502, lng: 7.7 })).toBe(true)
    expect(doitEnvoyerPosition(d, 5_000, { lat: 48.6, lng: 7.7 })).toBe(false)
  })
  it('il y a…', () => {
    const now = Date.parse('2026-10-18T10:00:00Z')
    expect(ilYA('2026-10-18T09:59:40Z', now)).toBe("à l'instant")
    expect(ilYA('2026-10-18T09:56:00Z', now)).toBe('il y a 4 min')
    expect(ilYA('2026-10-18T07:30:00Z', now)).toBe('il y a 2 h')
    expect(positionAncienne('2026-10-18T09:45:00Z', now)).toBe(true)
    expect(positionAncienne('2026-10-18T09:55:00Z', now)).toBe(false)
  })
})

describe('clôture et journée déduite', () => {
  it('domicile / relais remis ; litige = non remis avec raisons ; collectes et neutres exclus', () => {
    const j = journeeDepuisArrets([
      a({ quantite: 3, statut: 'livre', colis_remis: 3 }),
      a({ quantite: 2, statut: 'livre', colis_remis: 1 }),
      a({ quantite: 21, type: 'rc', statut: 'rc_remis', colis_remis: 21 }),
      a({ quantite: 1, statut: 'avise', colis_remis: 0 }),
      a({ quantite: 2, statut: 'refuse', colis_remis: 0 }),
      a({ quantite: 1 }),
      a({ quantite: 4, type: 'col', statut: 'col_ok', colis_remis: 4 }),
      a({ quantite: 1, type: 'col', statut: 'col_rien', colis_remis: 0 }),
    ])
    expect(j).toEqual({
      colis_domicile: 4, colis_relais: 21, colis_litige: 5,
      litige_raison: 'Refusé 2 · Avisé 1 · Livré en partie 1 · Non traité 1',
    })
    expect(journeeDepuisArrets([a({ statut: 'livre', colis_remis: 1 })]).litige_raison).toBeNull()
  })
  it('non traités', () => {
    expect(nonTraites([a({}), a({ statut: 'livre' })])).toBe(1)
  })
})
