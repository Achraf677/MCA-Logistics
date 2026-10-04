import { describe, it, expect } from 'vitest'
import {
  isGeocoded, estimateFuelCostCts, affectationsSuggerees, affectationsEcrasees,
  googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  isDelivered, deliveredProgress, hasUndeliveredStops,
  canStartTour, canFinishTour,
  geocodedPool, canDispatch, groupToursWithStops, totalsAcrossTours,
  googleMapsAdresseUrl, wazeAdresseUrl, deplacerArret,
  estEnRetard, coursesEnRetard, fusionnerPool, libelleRetard, dateDepuisParam,
  debutTourneeSuggere, construireLigneHeures, aDejaDesHeures, heureLocale,
  type TourDeliveryAvecTournee,
} from './tournees.logic'
import type { Tour, TourDelivery } from './tournees.types'

function mk(partial: Partial<TourDelivery>): TourDelivery {
  return {
    id: 'x', date: '2026-06-07', statut: 'planifiee',
    description: null, weight_kg: null, pickup_address: null, retrait_a_faire: false,
    delivery_address: null,
    delivery_lat: null, delivery_lng: null,
    tour_id: null, stop_order: null, arrival_time: null,
    delivered_at: null, clients: null, driver_id: null, vehicle_id: null,
    ...partial,
  }
}

function mkTour(partial: Partial<Tour>): Tour {
  return {
    id: 't', company_id: 'c', date: '2026-06-07', vehicle_id: null, driver_id: null,
    status: 'optimisee', depot_lat: null, depot_lng: null,
    total_km: null, total_duration_min: null, geometry: null,
    optimized_at: null, notes: null, eviter_peages: false, created_at: '', updated_at: '',
    ...partial,
  }
}

const geo = { delivery_lat: 48.5, delivery_lng: 7.7 }

describe('isGeocoded', () => {
  it('vrai si lat ET lng présents', () => {
    expect(isGeocoded(mk({ delivery_lat: 48.5, delivery_lng: 7.7 }))).toBe(true)
  })
  it('faux si une coordonnée manque', () => {
    expect(isGeocoded(mk({ delivery_lat: 48.5, delivery_lng: null }))).toBe(false)
    expect(isGeocoded(mk({ delivery_lat: null, delivery_lng: 7.7 }))).toBe(false)
  })
})

describe('estimateFuelCostCts', () => {
  it('applique 0,15 €/km par défaut et arrondit au centime', () => {
    expect(estimateFuelCostCts(100)).toBe(1500)      // 100 km × 15 cts
    expect(estimateFuelCostCts(7.77)).toBe(117)      // 116.55 → 117 (arrondi)
  })
  it('accepte un coût/km personnalisé', () => {
    expect(estimateFuelCostCts(100, 20)).toBe(2000)
  })
  it('renvoie 0 pour km absent ou nul', () => {
    expect(estimateFuelCostCts(null)).toBe(0)
    expect(estimateFuelCostCts(0)).toBe(0)
  })
})

describe('navigation GPS', () => {
  it('googleMapsStopUrl → destination simple', () => {
    expect(googleMapsStopUrl(48.5839, 7.7521))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=48.5839,7.7521')
  })

  it('wazeUrl → point + navigate', () => {
    expect(wazeUrl(48.5839, 7.7521))
      .toBe('https://waze.com/ul?ll=48.5839,7.7521&navigate=yes')
  })

  it('googleMapsRouteUrl → dépôt origine+destination, waypoints ordonnés et encodés', () => {
    const depot = { lat: 48.50, lng: 7.50 }
    const stops = [
      { stop_order: 2, lat: 48.62, lng: 7.62 },
      { stop_order: 1, lat: 48.61, lng: 7.61 },
    ]
    const url = googleMapsRouteUrl(depot, stops)!
    expect(url).toContain('origin=48.5,7.5')
    expect(url).toContain('destination=48.5,7.5')
    // ordonné par stop_order (1 puis 2), séparateur | encodé en %7C, virgules en %2C
    expect(url).toContain('waypoints=48.61%2C7.61%7C48.62%2C7.62')
  })

  it('googleMapsRouteUrl → null sans dépôt, base seule sans waypoints', () => {
    expect(googleMapsRouteUrl(null, [])).toBeNull()
    const url = googleMapsRouteUrl({ lat: 1, lng: 2 }, [])!
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&origin=1,2&destination=1,2')
  })
})

describe('navigation GPS — éviter les péages', () => {
  // Paramètres documentés : `avoid=tolls` chez Google, `avoid_tolls=true` chez
  // Waze. Ils sont testés littéralement : une faute de frappe ne produirait
  // aucune erreur visible, juste un itinéraire qui passe par les péages.
  it('absent par défaut : aucun paramètre ajouté', () => {
    expect(googleMapsStopUrl(48.5, 7.5)).not.toContain('avoid')
    expect(wazeUrl(48.5, 7.5)).not.toContain('avoid')
    expect(googleMapsRouteUrl({ lat: 1, lng: 2 }, [])).not.toContain('avoid')
  })

  it('ajoute le bon paramètre à chaque service', () => {
    expect(googleMapsStopUrl(48.5, 7.5, { eviterPeages: true })).toContain('&avoid=tolls')
    expect(wazeUrl(48.5, 7.5, { eviterPeages: true })).toContain('&avoid_tolls=true')
  })

  it('itinéraire complet : le paramètre suit les waypoints, pas l’inverse', () => {
    const url = googleMapsRouteUrl(
      { lat: 48.5, lng: 7.5 },
      [{ stop_order: 1, lat: 48.6, lng: 7.6 }],
      { eviterPeages: true },
    )!
    expect(url).toContain('waypoints=')
    expect(url.endsWith('&avoid=tolls')).toBe(true)
  })

  it('eviterPeages false se comporte comme absent', () => {
    expect(googleMapsStopUrl(48.5, 7.5, { eviterPeages: false })).not.toContain('avoid')
  })
})

describe('suivi des arrêts', () => {
  it('isDelivered → vrai si statut livree', () => {
    expect(isDelivered(mk({ statut: 'livree' }))).toBe(true)
    expect(isDelivered(mk({ statut: 'en_cours' }))).toBe(false)
  })

  it('deliveredProgress → X / N', () => {
    const stops = [mk({ statut: 'livree' }), mk({ statut: 'planifiee' }), mk({ statut: 'livree' })]
    expect(deliveredProgress(stops)).toEqual({ delivered: 2, total: 3 })
    expect(deliveredProgress([])).toEqual({ delivered: 0, total: 0 })
  })

  it('hasUndeliveredStops', () => {
    expect(hasUndeliveredStops([mk({ statut: 'livree' }), mk({ statut: 'planifiee' })])).toBe(true)
    expect(hasUndeliveredStops([mk({ statut: 'livree' })])).toBe(false)
    expect(hasUndeliveredStops([])).toBe(false)
  })
})

describe('cycle de vie tournée', () => {
  it('canStartTour → optimisee, ou brouillon ayant des arrêts', () => {
    expect(canStartTour('optimisee')).toBe(true)
    expect(canStartTour('optimisee', 0)).toBe(true)
    // Un brouillon vide n'est pas une tournée.
    expect(canStartTour('brouillon')).toBe(false)
    expect(canStartTour('brouillon', 0)).toBe(false)
    // Ordre imposé à la main : composée sans optimisation, donc brouillon.
    expect(canStartTour('brouillon', 3)).toBe(true)
    expect(canStartTour('en_cours', 3)).toBe(false)
    expect(canStartTour('terminee', 3)).toBe(false)
  })
  it('canFinishTour → seulement en_cours', () => {
    expect(canFinishTour('en_cours')).toBe(true)
    expect(canFinishTour('optimisee')).toBe(false)
    expect(canFinishTour('terminee')).toBe(false)
  })
})

// ── Multi-véhicule ─────────────────────────────────────────────────────────────

describe('geocodedPool', () => {
  it('ne garde que les livraisons géocodées', () => {
    const pool = [
      mk({ id: 'a', ...geo }),
      mk({ id: 'b' }),                                   // non géocodée
      mk({ id: 'c', delivery_lat: 48.6, delivery_lng: null }), // partielle → exclue
      mk({ id: 'd', delivery_lat: 48.7, delivery_lng: 7.8 }),
    ]
    expect(geocodedPool(pool).map(d => d.id)).toEqual(['a', 'd'])
  })
})

describe('canDispatch', () => {
  const assignment = { vehicle_id: 'v1', driver_id: null }
  it('faux sans aucune affectation', () => {
    expect(canDispatch([], [mk({ ...geo })])).toBe(false)
  })
  it('faux sans aucune livraison géocodée', () => {
    expect(canDispatch([assignment], [mk({ id: 'a' })])).toBe(false)
    expect(canDispatch([assignment], [])).toBe(false)
  })
  it('vrai avec ≥ 1 affectation ET ≥ 1 géocodée', () => {
    expect(canDispatch([assignment], [mk({ ...geo }), mk({ id: 'z' })])).toBe(true)
  })
})

describe('groupToursWithStops', () => {
  it('regroupe par tour_id, trie par stop_order (null en dernier), tournées stables', () => {
    const tours = [mkTour({ id: 't1' }), mkTour({ id: 't2' })]
    const deliveries = [
      mk({ id: 'd1', tour_id: 't1', stop_order: 2 }),
      mk({ id: 'd2', tour_id: 't1', stop_order: null }),
      mk({ id: 'd3', tour_id: 't1', stop_order: 1 }),
      mk({ id: 'd4', tour_id: 't2', stop_order: 1 }),
      mk({ id: 'd5', tour_id: null }),                 // non assignée → ignorée
    ]
    const grouped = groupToursWithStops(tours, deliveries)
    expect(grouped.map(g => g.tour.id)).toEqual(['t1', 't2'])
    expect(grouped[0].stops.map(s => s.id)).toEqual(['d3', 'd1', 'd2']) // 1, 2, null
    expect(grouped[1].stops.map(s => s.id)).toEqual(['d4'])
  })

  it('tournée sans arrêt → liste vide', () => {
    const grouped = groupToursWithStops([mkTour({ id: 't9' })], [])
    expect(grouped[0].stops).toEqual([])
  })
})

describe('totalsAcrossTours', () => {
  it('somme km et minutes en ignorant les null', () => {
    const tours = [
      mkTour({ total_km: 12.5, total_duration_min: 30 }),
      mkTour({ total_km: null, total_duration_min: 15 }),
      mkTour({ total_km: 7.5,  total_duration_min: null }),
    ]
    expect(totalsAcrossTours(tours)).toEqual({ totalKm: 20, totalMin: 45 })
  })
  it('liste vide → zéros', () => {
    expect(totalsAcrossTours([])).toEqual({ totalKm: 0, totalMin: 0 })
  })
})


describe('liens de navigation sur une adresse ecrite', () => {
  it('encode l adresse, espaces et virgules compris', () => {
    expect(googleMapsAdresseUrl('8 rue Turenne, 67000 Strasbourg'))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=8%20rue%20Turenne%2C%2067000%20Strasbourg')
  })

  it('ajoute l evitement des peages quand il est demande', () => {
    expect(googleMapsAdresseUrl('Nantes', { eviterPeages: true }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=Nantes&avoid=tolls')
  })

  it('ignore les espaces autour de l adresse', () => {
    expect(googleMapsAdresseUrl('  Nantes  ')).toContain('destination=Nantes')
  })

  it('Waze : recherche par adresse, sans parametre de peage', () => {
    const url = wazeAdresseUrl('8 rue Turenne, 67000 Strasbourg')
    expect(url).toBe('https://waze.com/ul?q=8%20rue%20Turenne%2C%2067000%20Strasbourg&navigate=yes')
    // Waze n'applique pas avoid_tolls a une recherche par adresse : ne pas le
    // mettre vaut mieux que de faire croire que la consigne est passee.
    expect(url).not.toContain('avoid_tolls')
  })
})

describe('deplacerArret', () => {
  const ids = ['a', 'b', 'c']

  it('monte un arret d un cran', () => {
    expect(deplacerArret(ids, 'b', 'haut')).toEqual(['b', 'a', 'c'])
  })

  it('descend un arret d un cran', () => {
    expect(deplacerArret(ids, 'b', 'bas')).toEqual(['a', 'c', 'b'])
  })

  it('le premier ne peut pas monter', () => {
    expect(deplacerArret(ids, 'a', 'haut')).toEqual(ids)
  })

  it('le dernier ne peut pas descendre', () => {
    expect(deplacerArret(ids, 'c', 'bas')).toEqual(ids)
  })

  it('un identifiant inconnu ne change rien', () => {
    expect(deplacerArret(ids, 'zzz', 'haut')).toEqual(ids)
  })

  it('ne modifie pas le tableau recu', () => {
    const entree = ['a', 'b', 'c']
    deplacerArret(entree, 'b', 'haut')
    expect(entree).toEqual(['a', 'b', 'c'])
  })

  it('liste d un seul arret : rien ne bouge', () => {
    expect(deplacerArret(['a'], 'a', 'haut')).toEqual(['a'])
    expect(deplacerArret(['a'], 'a', 'bas')).toEqual(['a'])
  })
})

// ── Lot P3 : retards ──────────────────────────────────────────────────────────

describe('courses en retard', () => {
  const r = (p: Partial<TourDeliveryAvecTournee>): TourDeliveryAvecTournee => ({ ...mk(p), tours: p.tours ?? null })

  it('estEnRetard : strictement avant la date de référence', () => {
    expect(estEnRetard({ date: '2026-09-30' }, '2026-10-01')).toBe(true)
    expect(estEnRetard({ date: '2026-10-01' }, '2026-10-01')).toBe(false)
    expect(estEnRetard({ date: '2026-10-02' }, '2026-10-01')).toBe(false)
  })

  it('garde planifiee / en_cours passées, hors tournée terminée, plus ancienne d abord', () => {
    const out = coursesEnRetard([
      r({ id: 'a', date: '2026-09-29', statut: 'planifiee' }),
      r({ id: 'b', date: '2026-09-20', statut: 'en_cours', tours: { status: 'en_cours' } }),
      r({ id: 'c', date: '2026-09-28', statut: 'planifiee', tours: { status: 'terminee' } }),
      r({ id: 'd', date: '2026-09-28', statut: 'livree' }),
      r({ id: 'e', date: '2026-10-01', statut: 'planifiee' }),
    ], '2026-10-01')
    expect(out.map(d => d.id)).toEqual(['b', 'a'])
    expect('tours' in out[0]).toBe(false)
  })

  it('fusionnerPool : retards en tête, sans doublon', () => {
    const out = fusionnerPool([mk({ id: 'j1' }), mk({ id: 'x' })], [mk({ id: 'x' }), mk({ id: 'r1' })])
    expect(out.map(d => d.id)).toEqual(['x', 'r1', 'j1'])
  })

  it('libelleRetard : JJ/MM', () => {
    expect(libelleRetard('2026-09-07')).toBe('En retard (07/09)')
  })

  it('dateDepuisParam : valide, invalide, absente', () => {
    expect(dateDepuisParam('2026-10-05')).toBe('2026-10-05')
    expect(dateDepuisParam('2026-02-30')).toBeNull()
    expect(dateDepuisParam('05/10/2026')).toBeNull()
    expect(dateDepuisParam(null)).toBeNull()
    expect(dateDepuisParam('')).toBeNull()
  })
})

// ── Lot P3 : heures de tournée ────────────────────────────────────────────────

describe('heures de tournée', () => {
  it('debutTourneeSuggere : updated_at d une tournée en cours le jour même', () => {
    const iso = new Date(2026, 9, 1, 7, 45).toISOString()
    expect(debutTourneeSuggere({ status: 'en_cours', updated_at: iso, date: '2026-10-01' })).toBe('07:45')
    expect(debutTourneeSuggere({ status: 'en_cours', updated_at: iso, date: '2026-10-02' })).toBeNull()
    expect(debutTourneeSuggere({ status: 'optimisee', updated_at: iso, date: '2026-10-01' })).toBeNull()
    expect(debutTourneeSuggere({ status: 'en_cours', updated_at: '', date: '2026-10-01' })).toBeNull()
  })

  it('heureLocale : HH:MM', () => {
    expect(heureLocale(new Date(2026, 9, 1, 9, 5).toISOString())).toBe('09:05')
  })

  it('construireLigneHeures : ligne complète', () => {
    const r = construireLigneHeures({
      companyId: 'c', memberId: 'm', date: '2026-10-01', debut: '07:30', fin: '16:10', libelleTournee: 'Master',
    })
    expect(r).toEqual({
      ligne: {
        company_id: 'c', member_id: 'm', date: '2026-10-01', start_time: '07:30', end_time: '16:10',
        break_minutes: 0, delivery_id: null, notes: 'Tournée Master',
      },
    })
  })

  it('construireLigneHeures : refuse fin <= début et heures mal formées', () => {
    const base = { companyId: 'c', memberId: 'm', date: '2026-10-01' }
    expect(construireLigneHeures({ ...base, debut: '16:00', fin: '08:00' })).toHaveProperty('erreur')
    expect(construireLigneHeures({ ...base, debut: '08:00', fin: '08:00' })).toHaveProperty('erreur')
    expect(construireLigneHeures({ ...base, debut: '', fin: '08:00' })).toHaveProperty('erreur')
    expect(construireLigneHeures({ ...base, debut: '7:00', fin: '25:00' })).toHaveProperty('erreur')
  })

  it('aDejaDesHeures : même chauffeur même jour', () => {
    const lignes = [{ member_id: 'm', date: '2026-10-01' }]
    expect(aDejaDesHeures(lignes, 'm', '2026-10-01')).toBe(true)
    expect(aDejaDesHeures(lignes, 'm', '2026-10-02')).toBe(false)
    expect(aDejaDesHeures(lignes, 'n', '2026-10-01')).toBe(false)
    expect(aDejaDesHeures([], 'm', '2026-10-01')).toBe(false)
  })
})

describe('affectations existantes (T1)', () => {
  it('reprend les tournées, puis les courses affectées (chauffeur le plus fréquent)', () => {
    const r = affectationsSuggerees(
      [{ vehicle_id: 'v1', driver_id: 'pierre' }],
      [
        mk({ id: 'a', vehicle_id: 'v1', driver_id: 'paul' }),
        mk({ id: 'b', vehicle_id: 'v2', driver_id: 'jean' }),
        mk({ id: 'c', vehicle_id: 'v2', driver_id: 'marc' }),
        mk({ id: 'd', vehicle_id: 'v2', driver_id: 'marc' }),
        mk({ id: 'e', vehicle_id: null, driver_id: 'luc' }),
      ],
    )
    expect(r.vehicules).toEqual(['v1', 'v2'])
    expect(r.chauffeurParVehicule).toEqual({ v1: 'pierre', v2: 'marc' })
  })
  it('« mon ordre » : signale toute affectation différente', () => {
    const c = [
      mk({ id: 'a', vehicle_id: 'v1', driver_id: 'pierre' }),
      mk({ id: 'b', vehicle_id: 'v2', driver_id: null }),
      mk({ id: 'c', vehicle_id: null, driver_id: 'paul' }),
      mk({ id: 'd' }),
    ]
    expect(affectationsEcrasees(c, [{ vehicle_id: 'v1', driver_id: 'pierre' }], 'ordre').map(x => x.id))
      .toEqual(['b', 'c'])
  })
  it('« optimiser » : seulement hors des véhicules et chauffeurs choisis', () => {
    const c = [
      mk({ id: 'a', vehicle_id: 'v2', driver_id: 'paul' }),
      mk({ id: 'b', vehicle_id: 'v3', driver_id: null }),
      mk({ id: 'c', vehicle_id: null, driver_id: 'luc' }),
    ]
    const a = [{ vehicle_id: 'v1', driver_id: 'pierre' }, { vehicle_id: 'v2', driver_id: 'paul' }]
    expect(affectationsEcrasees(c, a, 'optimiser').map(x => x.id)).toEqual(['b', 'c'])
  })
})
