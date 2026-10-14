import { describe, it, expect } from 'vitest'
import {
  erreurAcces, libelleErreurAcces, comptesALier, compteDuMail, aptitude, salaireSaisiCts, dateFr, erreurDateFin, membresCsv,
} from './equipe.logic'
import type { TeamMember } from './equipe.types'

const membre = (p: Partial<TeamMember> = {}): TeamMember => ({
  id: 'm1', company_id: 'c1', profile_id: null, full_name: 'Jean Dupont', role: 'chauffeur',
  role_label: null, idcc: '16', coefficient: null, contract_type: 'cdi', salary_gross_cts: null,
  start_date: '2026-01-05', end_date: null, phone: null, email: null, license_type: 'B',
  licence_b_expiry: null, medical_visit_expiry: null, active: true,
  created_at: '', updated_at: '', ...p,
})

describe('comptes à relier', () => {
  const comptes = [
    { id: 'p1', full_name: 'Mohammed Chikri', email: 'mo@x.fr', role: 'chauffeur', active: true },
    { id: 'p2', full_name: 'LUCAS  BACHER', email: 'zyd@x.fr', role: 'chauffeur', active: true },
    { id: 'p3', full_name: 'Achraf', email: 'moi@x.fr', role: 'president', active: true },
    { id: 'p4', full_name: 'Déjà Relié', email: 'r@x.fr', role: 'chauffeur', active: true },
  ]
  it('écarte les comptes déjà reliés à une fiche', () => {
    expect(comptesALier(comptes, ['p4'], { full_name: 'X', email: null }, null).map(c => c.id)).not.toContain('p4')
  })
  it('met en tête le compte du même nom (casse, espaces, accents ignorés)', () => {
    const r = comptesALier(comptes, ['p4'], { full_name: 'Lucas Bacher', email: null }, 'p3')
    expect(r[0].id).toBe('p2')
    expect(r[0].suggere).toBe(true)
  })
  it('un compte président n’est proposé que sur SA fiche', () => {
    expect(comptesALier(comptes, [], { full_name: 'Lucas Bacher', email: null }, 'p3').map(c => c.id)).not.toContain('p3')
    const r = comptesALier(comptes, [], { full_name: 'ACHRAF', email: 'moi@x.fr' }, 'p3')
    expect(r[0]).toMatchObject({ id: 'p3', suggere: true, estMoi: true })
  })
  it('ou du même e-mail', () => {
    expect(comptesALier(comptes, [], { full_name: 'Autre', email: 'MO@x.fr' }, null)[0].id).toBe('p1')
  })
  it('retrouve un compte par e-mail saisi', () => {
    expect(compteDuMail(comptes, ' Zyd@X.fr ')?.id).toBe('p2')
    expect(compteDuMail(comptes, 'nouveau@x.fr')).toBeNull()
    expect(compteDuMail(comptes, '')).toBeNull()
  })
})

describe('accès au site (lot S0)', () => {
  it('e-mail obligatoire et valide', () => {
    expect(erreurAcces({ email: 'x', mode: 'invitation', motDePasse: '' })).toBe('E-mail invalide.')
    expect(erreurAcces({ email: ' a@b.fr ', mode: 'invitation', motDePasse: '' })).toBeNull()
  })
  it('mot de passe de 8 caractères en mode mot de passe seulement', () => {
    expect(erreurAcces({ email: 'a@b.fr', mode: 'mot_de_passe', motDePasse: '1234567' })).toMatch(/8 caractères/)
    expect(erreurAcces({ email: 'a@b.fr', mode: 'mot_de_passe', motDePasse: '12345678' })).toBeNull()
  })
  it('codes d erreur traduits, sinon le détail', () => {
    expect(libelleErreurAcces('fiche_deja_reliee')).toMatch(/déjà reliée/)
    expect(libelleErreurAcces('autre', 'boom')).toBe('boom')
    expect(libelleErreurAcces(null)).toBe('Erreur inconnue.')
  })
})

describe('aptitude', () => {
  const today = new Date(2026, 9, 12)
  it('« À compléter » sans date de permis ou de visite (jamais « Apte » à vide)', () => {
    expect(aptitude(membre(), today)).toBe('a_completer')
    expect(aptitude(membre({ licence_b_expiry: '2030-01-01' }), today)).toBe('a_completer')
  })
  it('« Apte » avec les deux dates valides', () => {
    expect(aptitude(membre({ licence_b_expiry: '2030-01-01', medical_visit_expiry: '2028-01-01' }), today)).toBe('apte')
  })
  it('« À régulariser » dès qu une date est dépassée', () => {
    expect(aptitude(membre({ licence_b_expiry: '2026-01-01' }), today)).toBe('a_regulariser')
  })
})

describe('saisie de la fiche', () => {
  it('salaire vide = null, pas 0', () => {
    expect(salaireSaisiCts('')).toBeNull()
    expect(salaireSaisiCts('  ')).toBeNull()
    expect(salaireSaisiCts('abc')).toBeNull()
    expect(salaireSaisiCts('2500,50')).toBe(250050)
    expect(salaireSaisiCts('0')).toBe(0)
  })
  it('dates en français', () => {
    expect(dateFr('2026-10-12')).toBe('12/10/2026')
    expect(dateFr(null)).toBe('—')
  })
  it('date de fin : requise et pas avant l entrée', () => {
    expect(erreurDateFin('', null)).toMatch(/requise/)
    expect(erreurDateFin('2025-12-31', '2026-01-05')).toMatch(/avant/)
    expect(erreurDateFin('2026-10-12', '2026-01-05')).toBeNull()
  })
})

describe('export CSV des membres', () => {
  it('en-têtes, dates françaises, échappement', () => {
    const csv = membresCsv([membre({ full_name: 'A; B', end_date: '2026-10-12', role_label: 'Livreur' })])
    const [entetes, ligne] = csv.split('\n')
    expect(entetes).toBe('Nom;Fonction;Contrat;Entrée;Sortie;Permis B (fin);Prochaine visite médicale;Actif')
    expect(ligne).toBe('"A; B";Livreur;CDI;05/01/2026;12/10/2026;—;—;Oui')
  })
})
