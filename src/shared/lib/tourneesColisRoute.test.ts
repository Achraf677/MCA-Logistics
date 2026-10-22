import { describe, it, expect } from 'vitest'
import {
  arretsDansOrdre, prochainDansOrdre, sectionsListe, arretsAPlacer, deplacer, ordreInverse, ordreManuel, libelleDuree, libelleDistance,
  bandeauOrdre, heurePassage, pointsCarte, couperTrace, doitEnvoyerPosition, ilYA, positionAncienne,
  journeeDepuisArrets, nonTraites, modeOrdre, sansCalcul, idsOrdreHabituel, avancementParCategorie,
  arretsEnPause, estEnPause, inclureEnPause, grouperEnSuite, infosGroupes, contourGroupe, tracerParGroupe,
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
  it('ordre habituel : par rang habituel, arrêts sans rang exclus', () => {
    expect(idsOrdreHabituel([a({ id: '1', rang_habituel: 2 }), a({ id: '2', rang_habituel: 1 }), a({ id: '3' })])).toEqual(['2', '1'])
    expect(arretsDansOrdre([a({ id: '1', ordre: 2 }), a({ id: '2', ordre: 1 })], 'habituel').map(x => x.id)).toEqual(['2', '1'])
  })
  it('mode inconnu = feuille', () => {
    expect(modeOrdre({ ordre_mode: null })).toBe('feuille')
    expect(modeOrdre({ ordre_mode: 'manuel' })).toBe('manuel')
    expect(modeOrdre({ ordre_mode: 'habituel' })).toBe('habituel')
    expect(sansCalcul('habituel') && sansCalcul('feuille') && !sansCalcul('route')).toBe(true)
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
    expect(bandeauOrdre({ ordre_mode: 'habituel', trajet: null }).titre).toBe('Mon ordre habituel')
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

describe('avancement par catégorie', () => {
  it('classique / relais / collecte : total, traités, colis ; catégories vides omises', () => {
    const r = avancementParCategorie([
      a({ type: 'c', quantite: 2, statut: 'livre' }), a({ type: 'c', quantite: 1 }),
      a({ type: 'rc', quantite: 21, statut: 'rc_remis' }), a({ type: 'rc', quantite: 4 }),
    ])
    expect(r.map(c => [c.type, c.total, c.traites, c.colis])).toEqual([['c', 2, 1, 3], ['rc', 2, 1, 25]])
  })
})

describe('ordreInverse (commencer par la fin)', () => {
  const mk = (id: string, ordre: number | null, statut: string | null = null) =>
    ({ id, rang: Number(id), ordre, statut } as unknown as Parameters<typeof ordreInverse>[0][number])
  it('inverse les arrêts à faire de l’ordre affiché, les traités restent devant', () => {
    const liste = [mk('1', 1, 'livre'), mk('2', 2), mk('3', 3), mk('4', 4)]
    expect(ordreInverse(liste, 'route')).toEqual(['4', '3', '2'])
    // Le prochain arrêt, une fois l'ordre réécrit, est l'ancien dernier.
    const ids = ordreInverse(liste, 'route')
    const reecrit = ordreManuel(liste, 'route', ids)
    const place = new Map(reecrit.map((id, i) => [id, i + 1]))
    const apres = liste.map(a => ({ ...a, ordre: place.get(a.id) ?? null }))
    expect(prochainDansOrdre(apres, 'manuel')?.id).toBe('4')
  })
  it('inversé deux fois = ordre d’origine', () => {
    const liste = [mk('1', 1), mk('2', 2), mk('3', 3)]
    const une = ordreInverse(liste, 'route')
    const place = new Map(ordreManuel(liste, 'route', une).map((id, i) => [id, i + 1]))
    const apres = liste.map(a => ({ ...a, ordre: place.get(a.id) ?? null }))
    expect(ordreInverse(apres, 'manuel')).toEqual(['1', '2', '3'])
  })
})

describe('arrêts en pause', () => {
  const p = (id: string, ordre: number, extra: Partial<ArretColis> = {}) => a({ id, ordre, ...extra })
  const liste = [p('1', 1), p('2', 2, { en_pause_le: '2026-10-21T08:00:00Z' }), p('3', 3), p('4', 4, { statut: 'livre', en_pause_le: '2026-10-21T07:00:00Z' })]
  it('le prochain arrêt saute la pause ; un arrêt traité n’est plus « en pause »', () => {
    expect(prochainDansOrdre(liste, 'route')?.id).toBe('1')
    expect(prochainDansOrdre([liste[1], liste[2]], 'route')?.id).toBe('3')
    expect(arretsEnPause(liste, 'route').map(x => x.id)).toEqual(['2'])
    expect(estEnPause(liste[3])).toBe(false)
  })
  it('la liste « à faire » cache la pause, qui reste comptée comme non traitée', () => {
    const s = sectionsListe(liste, 'route')
    expect(s.aFaire.flatMap(g => g.arrets).map(x => x.id)).toEqual(['1', '3'])
    expect(s.traites.map(x => x.id)).toEqual(['4'])
  })
  it('réordonner les arrêts visibles : la pause garde sa place (après son prédécesseur)', () => {
    const ancien = [{ id: '1', enPause: false }, { id: '2', enPause: true }, { id: '3', enPause: false }, { id: '5', enPause: false }]
    expect(inclureEnPause(ancien, ['5', '3', '1'])).toEqual(['5', '3', '1', '2'])
    // Pause en tête : elle reste en tête ; deux pauses à la suite gardent leur ordre.
    expect(inclureEnPause([{ id: '2', enPause: true }, { id: '1', enPause: false }, { id: '3', enPause: false }], ['3', '1'])).toEqual(['2', '3', '1'])
    expect(inclureEnPause([{ id: '1', enPause: false }, { id: '2', enPause: true }, { id: '4', enPause: true }, { id: '3', enPause: false }], ['3', '1'])).toEqual(['3', '1', '2', '4'])
  })
})

describe('groupes village / zone', () => {
  const mk = (id: string, commune: string, zone: string | null, ordre: number, lat = 48.7, lng = 7.7): ArretColis =>
    ({ id, commune, zone, ordre, rang: ordre, cp: '67170', lat, lng, statut: null, en_pause_le: null } as unknown as ArretColis)

  it('une zone de Brumath = un groupe, même commune', () => {
    const g = grouperEnSuite([mk('1', 'BRUMATH', 'ZONE 1', 1), mk('2', 'BRUMATH', 'ZONE 1', 2), mk('3', 'BRUMATH', 'ZONE 2', 3), mk('4', 'BRUMATH', null, 4)])
    expect(g.map(x => [x.zone, x.arrets.length])).toEqual([['ZONE 1', 2], ['ZONE 2', 1], [null, 1]])
  })
  it('couleurs : une par groupe, dans l\'ordre, libellés lisibles', () => {
    const i = infosGroupes([mk('1', 'Kriegsheim', null, 1), mk('2', 'Brumath', 'ZONE 3', 2), mk('3', 'Kriegsheim', null, 3)], 'route')
    expect([...i.values()].map(x => [x.libelle, x.nb])).toEqual([['Kriegsheim', 2], ['Brumath · Zone 3', 1]])
    expect(new Set([...i.values()].map(x => x.couleur)).size).toBe(2)
  })
  it('contour : entoure tous les points, élargi', () => {
    const c = contourGroupe([{ lat: 48.7, lng: 7.7 }, { lat: 48.71, lng: 7.71 }, { lat: 48.7, lng: 7.71 }])
    expect(c.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...c.map(p => p[0]))).toBeLessThan(48.7)
    expect(Math.max(...c.map(p => p[1]))).toBeGreaterThan(7.71)
    expect(contourGroupe([])).toEqual([])
  })
  it('tracé coupé par groupe : tronçons dans l\'ordre, couleurs de l\'arrêt rejoint', () => {
    const ligne: Array<[number, number]> = Array.from({ length: 21 }, (_, i) => [48.7, 7.7 + i * 0.001])
    const t = tracerParGroupe(ligne, [mk('a', 'X', null, 1, 48.7, 7.705), mk('b', 'X', null, 2, 48.7, 7.71), mk('c', 'Y', null, 3, 48.7, 7.72)])
    expect(t.map(x => x.cle)).toEqual(['x', 'y'])
    expect(t[0].points[0]).toEqual(ligne[0])
    expect(t[1].points[t[1].points.length - 1]).toEqual(ligne[20])
  })
})
