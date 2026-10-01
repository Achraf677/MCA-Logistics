import { describe, it, expect } from 'vitest'
import {
  grilleDuMois, villeDepuisAdresse, coursesParJour, tronquer, construireEcheances,
  echeancesParJour, statutLePlusGrave, joursAvecContenu, estSurLaRoute,
} from './mois.logic'
import type { CourseSource, VehiculeEcheanceSource, MembreEcheanceSource } from './mois.logic'

const course = (p: Partial<CourseSource> & { id: string }): CourseSource => ({
  date: '2026-10-14', driver_id: 'd1', delivery_address: '1 rue X, 67000 Strasbourg',
  urgent: false, statut: 'planifiee', prestation: 'express', clients: { name: 'Acme' }, ...p,
})

const vehicule = (p: Partial<VehiculeEcheanceSource> = {}): VehiculeEcheanceSource => ({
  id: 'v1', label: 'Master 1', plate: 'AB-123-CD', status: 'active',
  ct_expiry: null, insurance_expiry: null, next_revision_date: null, ...p,
})

const membre = (p: Partial<MembreEcheanceSource> = {}): MembreEcheanceSource => ({
  id: 'm1', full_name: 'Jean Dupont', active: true, licence_b_expiry: null, medical_visit_expiry: null, ...p,
})

const AUJ = new Date(2026, 9, 1) // 1er octobre 2026
const DEB = '2026-10-01'
const FIN = '2026-10-31'

describe('grilleDuMois', () => {
  it('octobre 2026 commence un jeudi (3 cases vides) et finit sur 5 semaines', () => {
    const g = grilleDuMois(2026, 9)
    expect(g).toHaveLength(5)
    expect(g[0].slice(0, 3)).toEqual([null, null, null])
    expect(g[0][3]?.getDate()).toBe(1)
    expect(g.every(s => s.length === 7)).toBe(true)
  })
  it('février 2027 commence un lundi', () => {
    expect(grilleDuMois(2027, 1)[0][0]?.getDate()).toBe(1)
  })
})

describe('villeDepuisAdresse', () => {
  it('ville après le code postal', () => {
    expect(villeDepuisAdresse('12 rue du Port, 67540 Ostwald')).toBe('Ostwald')
    expect(villeDepuisAdresse('3 Rue De Pitard 28360 Theuville, France')).toBe('Theuville')
  })
  it('sans code postal : dernier segment hors « France »', () => {
    expect(villeDepuisAdresse('Zone portuaire, Kehl, France')).toBe('Kehl')
  })
  it('rien d’exploitable → null', () => {
    expect(villeDepuisAdresse(null)).toBeNull()
    expect(villeDepuisAdresse('')).toBeNull()
    expect(villeDepuisAdresse('Entrepôt')).toBeNull()
  })
})

describe('coursesParJour', () => {
  it('écarte relevés de messagerie et forfaits', () => {
    expect(estSurLaRoute({ prestation: 'messagerie' })).toBe(false)
    expect(estSurLaRoute({ prestation: 'forfait' })).toBe(false)
    expect(estSurLaRoute({ prestation: null })).toBe(true)
    const m = coursesParJour([
      course({ id: 'a' }),
      course({ id: 'b', prestation: 'messagerie' }),
      course({ id: 'c', prestation: 'forfait' }),
    ])
    expect(m.get('2026-10-14')?.nb).toBe(1)
  })
  it('compte, sans chauffeur (à faire seulement), urgentes, annulées hors compte', () => {
    const m = coursesParJour([
      course({ id: 'a', driver_id: null }),
      course({ id: 'b', urgent: true }),
      course({ id: 'c', driver_id: null, statut: 'livree' }), // faite : pas « sans chauffeur »
      course({ id: 'd', statut: 'annulee', urgent: true, driver_id: null }),
      course({ id: 'e', date: '2026-10-15' }),
    ])
    const j = m.get('2026-10-14')!
    expect(j.nb).toBe(3)
    expect(j.nbSansChauffeur).toBe(1)
    expect(j.nbUrgentes).toBe(1)
    expect(j.courses).toHaveLength(4)
    // Ordre : urgente, sans chauffeur, autres, annulée en dernier.
    expect(j.courses.map(c => c.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(j.courses[0].ville).toBe('Strasbourg')
    expect(m.get('2026-10-15')?.nb).toBe(1)
  })
  it('client absent → « Client ? »', () => {
    const m = coursesParJour([course({ id: 'a', clients: null })])
    expect(m.get('2026-10-14')!.courses[0].client).toBe('Client ?')
  })
})

describe('tronquer', () => {
  it('pas de coupe si ça tient', () => {
    expect(tronquer([1, 2, 3], 3)).toEqual({ visibles: [1, 2, 3], reste: 0 })
  })
  it('jamais « +1 » : max-1 visibles + reste', () => {
    expect(tronquer([1, 2, 3, 4], 3)).toEqual({ visibles: [1, 2], reste: 2 })
    expect(tronquer([1, 2, 3, 4, 5, 6], 3)).toEqual({ visibles: [1, 2], reste: 4 })
  })
})

describe('construireEcheances', () => {
  it('véhicule : assurance, CT, révision dans le mois ; hors mois ignoré', () => {
    const r = construireEcheances({
      vehicules: [vehicule({ insurance_expiry: '2026-10-10', ct_expiry: '2026-11-02', next_revision_date: '2026-10-31' })],
      entretiens: [], membres: [],
    }, DEB, FIN, AUJ)
    expect(r.map(m => [m.date, m.categorie])).toEqual([
      ['2026-10-10', 'assurance'],
      ['2026-10-31', 'revision'],
    ])
    expect(r[0].sujet).toBe('Master 1 · AB-123-CD')
    expect(r[0].statut).toBe('soon')
    expect(r[1].statut).toBe('soon') // 30 j pile : encore « bientôt »
    const loin = construireEcheances({
      vehicules: [vehicule({ next_revision_date: '2026-10-31' })], entretiens: [], membres: [],
    }, DEB, FIN, new Date(2026, 8, 1))
    expect(loin[0].statut).toBe('ok')
  })
  it('véhicule inactif ignoré (et ses entretiens)', () => {
    const r = construireEcheances({
      vehicules: [vehicule({ status: 'inactive', ct_expiry: '2026-10-10' })],
      entretiens: [{ id: 'e1', vehicle_id: 'v1', type: 'vidange', date: '2026-05-01', next_due_date: '2026-10-12' }],
      membres: [],
    }, DEB, FIN, AUJ)
    expect(r).toEqual([])
  })
  it('entretiens : seul le dernier de chaque (véhicule, type) compte', () => {
    const r = construireEcheances({
      vehicules: [vehicule()],
      entretiens: [
        { id: 'e1', vehicle_id: 'v1', type: 'vidange', date: '2026-01-01', next_due_date: '2026-10-05' }, // remplacé
        { id: 'e2', vehicle_id: 'v1', type: 'vidange', date: '2026-06-01', next_due_date: '2026-10-20' },
        { id: 'e3', vehicle_id: 'v1', type: 'pneus', date: '2026-06-01', next_due_date: null },
      ],
      membres: [],
    }, DEB, FIN, AUJ)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ date: '2026-10-20', libelle: 'Vidange', categorie: 'entretien', domaine: 'vehicule' })
  })
  it('CT en double (fiche véhicule + entretien le même jour) → un seul marqueur', () => {
    const r = construireEcheances({
      vehicules: [vehicule({ ct_expiry: '2026-10-08' })],
      entretiens: [{ id: 'e1', vehicle_id: 'v1', type: 'controle_technique', date: '2024-10-08', next_due_date: '2026-10-08' }],
      membres: [],
    }, DEB, FIN, AUJ)
    expect(r).toHaveLength(1)
    expect(r[0].categorie).toBe('controle_technique')
  })
  it('équipe : permis et visite médicale des membres actifs ; dépassée = overdue', () => {
    const auj = new Date(2026, 9, 20)
    const r = construireEcheances({
      vehicules: [], entretiens: [],
      membres: [
        membre({ licence_b_expiry: '2026-10-03', medical_visit_expiry: '2026-10-25' }),
        membre({ id: 'm2', full_name: 'Parti', active: false, licence_b_expiry: '2026-10-04' }),
      ],
    }, DEB, FIN, auj)
    expect(r.map(m => [m.categorie, m.statut])).toEqual([
      ['permis', 'overdue'],
      ['visite_medicale', 'soon'],
    ])
    expect(r[0].domaine).toBe('equipe')
    expect(r[0].sujet).toBe('Jean Dupont')
  })
})

describe('regroupements', () => {
  it('echeancesParJour + statutLePlusGrave', () => {
    const r = construireEcheances({
      vehicules: [vehicule({ insurance_expiry: '2026-10-10', ct_expiry: '2026-10-10' })],
      entretiens: [], membres: [],
    }, DEB, FIN, new Date(2026, 9, 12))
    const parJour = echeancesParJour(r)
    expect(parJour.get('2026-10-10')).toHaveLength(2)
    expect(statutLePlusGrave(parJour.get('2026-10-10')!)).toBe('overdue')
    expect(statutLePlusGrave([])).toBe('none')
  })
  it('joursAvecContenu respecte le filtre', () => {
    const courses = coursesParJour([course({ id: 'a', date: '2026-10-14' })])
    const ech = echeancesParJour(construireEcheances({
      vehicules: [vehicule({ insurance_expiry: '2026-10-20' })], entretiens: [], membres: [],
    }, DEB, FIN, AUJ))
    expect(joursAvecContenu(2026, 9, courses, ech, 'tout')).toEqual(['2026-10-14', '2026-10-20'])
    expect(joursAvecContenu(2026, 9, courses, ech, 'courses')).toEqual(['2026-10-14'])
    expect(joursAvecContenu(2026, 9, courses, ech, 'echeances')).toEqual(['2026-10-20'])
  })
})
