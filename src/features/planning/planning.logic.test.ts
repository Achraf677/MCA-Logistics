import { describe, it, expect } from 'vitest'
import {
  joursDeLaSemaine, dateLocale, estDeplacable, grouperParChauffeur, grouperParJour,
  compteursATraiter, correspondAuFiltre, creneauCarte, aDeplacer, appliquerDeplacement,
  alertesAffectation, alertesDeplacement,
} from './planning.logic'
import type { CoursePlanning, ChauffeurPlanning, VehiculePlanning } from './planning.types'
import { toLocalISO } from '../../shared/lib/dates'

function c(p: Partial<CoursePlanning>): CoursePlanning {
  return {
    id: 'x', date: '2026-09-28', statut: 'planifiee', driver_id: null, vehicle_id: null,
    delivery_lat: 48.5, probleme_le: null, team_members: null, ...p,
  } as unknown as CoursePlanning
}

const JOURS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
const EQUIPE: ChauffeurPlanning[] = [
  { id: 'a', full_name: 'Alice', role: 'chauffeur', licence_b_expiry: null, medical_visit_expiry: '2026-09-15' },
  { id: 'b', full_name: 'Bruno', role: 'chauffeur', licence_b_expiry: '2030-01-01', medical_visit_expiry: null },
  { id: 'p', full_name: 'Président', role: 'president', licence_b_expiry: null, medical_visit_expiry: null },
]
const VEHICULES: VehiculePlanning[] = [
  { id: 'v1', label: 'Master', plate: 'AA-123-AA', ct_expiry: '2026-09-29', insurance_expiry: '2027-01-01' },
]

describe('semaine', () => {
  it('lundi → dimanche, dimanche rattaché à la semaine qui finit', () => {
    const j = joursDeLaSemaine(new Date(2026, 9, 4)).map(toLocalISO) // dimanche 4/10
    expect(j).toEqual(JOURS)
    expect(joursDeLaSemaine(new Date(2026, 8, 28)).map(toLocalISO)).toEqual(JOURS)
  })
  it('dateLocale sans décalage UTC', () => {
    expect(toLocalISO(dateLocale('2026-10-01'))).toBe('2026-10-01')
  })
})

describe('grouperParChauffeur', () => {
  it('Non affecté en tête, chauffeurs ensuite, autre membre affecté en fin', () => {
    const lignes = grouperParChauffeur([
      c({ id: '1' }),
      c({ id: '2', driver_id: 'b', date: '2026-09-29' }),
      c({ id: '3', driver_id: 'p', date: '2026-09-29' }),
      c({ id: '4', driver_id: 'b', date: '2026-09-29' }),
      c({ id: '5', driver_id: 'b', date: '2026-10-10' }), // hors semaine
    ], JOURS, EQUIPE)
    expect(lignes.map(l => l.nom)).toEqual(['Non affecté', 'Alice', 'Bruno', 'Président'])
    expect(lignes[0].cellules['2026-09-28'].map(x => x.id)).toEqual(['1'])
    expect(lignes[2].cellules['2026-09-29'].map(x => x.id)).toEqual(['2', '4'])
    expect(lignes[2].total).toBe(2)
    expect(lignes[1].total).toBe(0)
  })
  it('chauffeur inconnu de l\'équipe : nom repris de la jointure', () => {
    const lignes = grouperParChauffeur([c({ driver_id: 'z', team_members: { full_name: 'Ancien' } })], JOURS, [])
    expect(lignes.map(l => l.nom)).toEqual(['Non affecté', 'Ancien'])
  })
  it('grouperParJour', () => {
    const j = grouperParJour([c({ id: '1' }), c({ id: '2', date: '2026-10-01' }), c({ id: '3', date: '2025-01-01' })], JOURS)
    expect(j['2026-10-01'].map(x => x.id)).toEqual(['2'])
    expect(Object.values(j).flat()).toHaveLength(2)
  })
})

describe('À traiter', () => {
  const auj = '2026-10-01'
  it('ne compte que les courses ouvertes', () => {
    expect(correspondAuFiltre(c({ statut: 'livree' }), 'sans_chauffeur', auj)).toBe(false)
    expect(correspondAuFiltre(c({ statut: 'en_cours' }), 'sans_chauffeur', auj)).toBe(true)
  })
  it('compteurs', () => {
    const semaine = [
      c({ id: '1' }), // sans chauffeur, sans véhicule
      c({ id: '2', driver_id: 'a', vehicle_id: 'v1', delivery_lat: null }),
      c({ id: '3', driver_id: 'a', vehicle_id: 'v1', probleme_le: '2026-09-30T10:00:00Z' }),
      c({ id: '4', statut: 'livree' }),
    ]
    const retard = [c({ id: 'r1', date: '2026-09-10' }), c({ id: 'r2', date: '2026-09-30', statut: 'en_cours' })]
    expect(compteursATraiter(semaine, retard, auj)).toEqual({
      sans_chauffeur: 1, sans_vehicule: 1, non_localisee: 1, echecs: 1, retard: 2,
    })
  })
})

describe('creneauCarte', () => {
  it('créneau saisi, sinon heure de tournée, sinon null', () => {
    expect(creneauCarte({ creneau_livraison_debut: '09:00:00', creneau_livraison_fin: '12:00:00', arrival_time: '10:00' })).toBe('9h – 12h')
    expect(creneauCarte({ creneau_livraison_debut: null, creneau_livraison_fin: null, arrival_time: '14:30:00' })).toBe('vers 14:30')
    expect(creneauCarte({ creneau_livraison_debut: null, creneau_livraison_fin: null, arrival_time: null })).toBeNull()
  })
})

describe('déplacement', () => {
  it('estDeplacable', () => {
    expect(estDeplacable('planifiee')).toBe(true)
    expect(estDeplacable('livree')).toBe(true)
    for (const s of ['facturee', 'payee', 'annulee']) expect(estDeplacable(s)).toBe(false)
  })
  it('aDeplacer : ignore les figées et les inchangées, liste celles à détacher', () => {
    const courses = [
      c({ id: '1', driver_id: 'a' }),
      c({ id: '2', driver_id: 'b', tour_id: 't1' }),
      c({ id: '3', driver_id: 'a', statut: 'facturee' }),
    ]
    expect(aDeplacer(courses, { driverId: 'b' })).toEqual({ ids: ['1'], aDetacher: [] })
    expect(aDeplacer(courses, { driverId: null })).toEqual({ ids: ['1', '2'], aDetacher: ['2'] })
    expect(aDeplacer(courses, { date: '2026-09-28' })).toEqual({ ids: [], aDetacher: [] })
  })
  it('appliquerDeplacement : chauffeur, jour, détachement de tournée', () => {
    const r = appliquerDeplacement(
      [c({ id: '1', tour_id: 't', stop_order: 3, arrival_time: '10:00' }), c({ id: '2' })],
      ['1'], { driverId: 'b', date: '2026-10-02' }, 'Bruno')
    expect(r[0]).toMatchObject({ driver_id: 'b', date: '2026-10-02', team_members: { full_name: 'Bruno' },
      tour_id: null, stop_order: null, arrival_time: null })
    expect(r[1].driver_id).toBeNull()
    const nonAff = appliquerDeplacement(r, ['1'], { driverId: null }, null)
    expect(nonAff[0].team_members).toBeNull()
  })
})

describe('contrôle des documents', () => {
  it('documents échus au jour de la course', () => {
    expect(alertesAffectation(EQUIPE[0], VEHICULES[0], '2026-09-28')).toEqual([
      'Alice : visite médicale échue le 15/09/2026',
    ])
    expect(alertesAffectation(EQUIPE[0], VEHICULES[0], '2026-09-30')).toEqual([
      'Alice : visite médicale échue le 15/09/2026',
      'Master : contrôle technique échu le 29/09/2026',
    ])
    expect(alertesAffectation(EQUIPE[1], null, '2026-09-30')).toEqual([])
    expect(alertesAffectation(null, null, '2026-09-30')).toEqual([])
  })
  it('alertesDeplacement : cible du chauffeur, sans doublon', () => {
    const courses = [c({ id: '1', vehicle_id: 'v1' }), c({ id: '2' })]
    expect(alertesDeplacement(courses, { driverId: 'a' }, EQUIPE, VEHICULES)).toEqual([
      'Alice : visite médicale échue le 15/09/2026',
    ])
    expect(alertesDeplacement(courses, { date: '2026-10-01' }, EQUIPE, VEHICULES)).toEqual([
      'Master : contrôle technique échu le 29/09/2026',
    ])
  })
})
