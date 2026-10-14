import { describe, it, expect } from 'vitest'
import {
  erreurEmail, decisionDonnerAcces, presidentSurAutreFiche, lignesComptes, fichesLiables, fusionnerComptes,
  libelleConnexionCompte, genererMotDePasse, libelleErreurAcces, aptitude, salaireSaisiCts, dateFr, erreurDateFin, membresCsv,
} from './equipe.logic'
import type { TeamMember } from './equipe.types'

const membre = (p: Partial<TeamMember> = {}): TeamMember => ({
  id: 'm1', company_id: 'c1', profile_id: null, full_name: 'Jean Dupont', role: 'chauffeur',
  role_label: null, idcc: '16', coefficient: null, contract_type: 'cdi', salary_gross_cts: null,
  start_date: '2026-01-05', end_date: null, phone: null, email: null, license_type: 'B',
  licence_b_expiry: null, medical_visit_expiry: null, active: true,
  created_at: '', updated_at: '', ...p,
})

describe('donner l’accès (un salarié = un compte)', () => {
  const comptes = [
    { id: 'p1', full_name: 'Mohammed Chikri', email: 'mo@x.fr', role: 'chauffeur', active: true },
    { id: 'p2', full_name: 'Compte Lucas', email: 'zydroxxg@gmail.com', role: 'chauffeur', active: true },
    { id: 'p3', full_name: 'Achraf', email: 'moi@x.fr', role: 'president', active: true },
  ]
  const fiches = [
    { id: 'f1', full_name: 'Mohammed Chikri', email: null, profile_id: 'p1' },
    { id: 'f2', full_name: 'Lucas Bacher', email: null, profile_id: null },
    { id: 'f3', full_name: 'Achraf Chikri', email: 'moi@x.fr', profile_id: null },
  ]
  it('e-mail invalide', () => {
    expect(decisionDonnerAcces('x', fiches[1], comptes, fiches)).toEqual({ type: 'invalide', message: 'E-mail invalide.' })
    expect(erreurEmail(' a@b.fr ')).toBeNull()
  })
  it('compte existant non relié → on le relie (casse et espaces ignorés)', () => {
    const d = decisionDonnerAcces(' ZydroxxG@gmail.com ', fiches[1], comptes, fiches)
    expect(d).toMatchObject({ type: 'relier', compte: { id: 'p2' } })
  })
  it('compte relié à une autre fiche → nomme la fiche', () => {
    expect(decisionDonnerAcces('mo@x.fr', fiches[1], comptes, fiches))
      .toMatchObject({ type: 'relie_ailleurs', fiche: 'Mohammed Chikri' })
  })
  it('nouvel e-mail → création', () => {
    expect(decisionDonnerAcces('nouveau@x.fr', fiches[1], comptes, fiches)).toEqual({ type: 'creer' })
  })
  it('compte président : seulement sur SA fiche', () => {
    expect(decisionDonnerAcces('moi@x.fr', fiches[1], comptes, fiches)).toMatchObject({ type: 'president' })
    expect(decisionDonnerAcces('moi@x.fr', fiches[2], comptes, fiches)).toMatchObject({ type: 'relier', compte: { id: 'p3' } })
    expect(presidentSurAutreFiche(comptes[2], { full_name: 'ACHRAF', email: null })).toBe(false)
  })
  it('liste des comptes : fiche reliée, soi, président non modifiable, sans fiche en tête', () => {
    const l = lignesComptes(comptes, fiches, 'p3')
    expect(l.map(c => c.id)).toEqual(['p3', 'p2', 'p1'])
    expect(l.find(c => c.id === 'p1')?.fiche?.full_name).toBe('Mohammed Chikri')
    expect(l.find(c => c.id === 'p3')).toMatchObject({ estMoi: true, modifiable: false })
    expect(l.find(c => c.id === 'p2')).toMatchObject({ estMoi: false, modifiable: true, fiche: null })
  })
  it('fiches liables : sans compte ; un président seulement sur la sienne', () => {
    expect(fichesLiables(comptes[1], fiches).map(f => f.id)).toEqual(['f3', 'f2'])
    expect(fichesLiables(comptes[2], fiches).map(f => f.id)).toEqual(['f3'])
  })
  it('fusion Edge + profils : e-mail du profil en repli ; Edge en échec → profils', () => {
    const profils = [{ id: 'p1', full_name: 'M', email: 'mo@x.fr', role: 'chauffeur', active: true }]
    expect(fusionnerComptes([{ id: 'p1', full_name: 'M', email: null, role: 'chauffeur', active: true }], profils)[0].email).toBe('mo@x.fr')
    expect(fusionnerComptes(null, profils)[0].last_sign_in_at).toBeUndefined()
  })
  it('dernière connexion : « — » si l’Edge ne la donne pas', () => {
    expect(libelleConnexionCompte(undefined)).toBe('—')
    expect(libelleConnexionCompte(null)).toBe('Jamais connecté')
  })
})

describe('mot de passe généré', () => {
  it('lisible : 3 groupes de 4, sans caractères ambigus, lettres et chiffres', () => {
    for (let i = 0; i < 200; i++) {
      const m = genererMotDePasse()
      expect(m).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/)
      expect(m.length).toBeGreaterThanOrEqual(10)
      expect(m).not.toMatch(/[01OoIil]/)
      expect(m).toMatch(/[a-z]/); expect(m).toMatch(/[A-Z]/); expect(m).toMatch(/[2-9]/)
    }
  })
  it('deux tirages diffèrent', () => {
    expect(genererMotDePasse()).not.toBe(genererMotDePasse())
  })
  it('source d’aléa injectable (déterministe), rejet des valeurs biaisées', () => {
    let k = 0
    const suite = [0xffffffff, 0, 23, 47, 1, 24, 48, 2, 25, 49, 3, 26, 50]
    const alea = (t: Uint32Array<ArrayBuffer>) => { t[0] = suite[k++ % suite.length]; return t }
    expect(genererMotDePasse(alea)).toBe('aA2b-B3cC-4dD5')
  })
})

describe('accès au site : erreurs', () => {
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
