import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { pageDuNom, propositionTournee, cheminsExistants, extensionDe, nomPropose as nomEdge, normaliserChemin, normaliserProposition, rapprocherTiers, rapprocherVehicule, TYPES_DOCUMENT as TYPES_EDGE } from './triDocuments'
import { TYPES_DOCUMENT as TYPES_FRONT } from '../../../src/shared/lib/documentsTri'

const brut = { type: 'ticket', type_confiance: 0.9, date: '2026-10-21', date_confiance: 0.9, tiers: "O'TACOS", tiers_confiance: 0.8, montant_ttc: 17.5, montant_confiance: 0.9, reference: 'T-123', resume: 'Repas du midi' }

describe('triDocuments', () => {
  it('garde une proposition sûre', () => {
    const p = normaliserProposition(brut, '2026-10-24')
    expect(p).toMatchObject({ type: 'ticket', date: '2026-10-21', tiers: "O'TACOS", montant_ttc_cts: 1750, reference: 'T-123' })
  })
  it('écarte le douteux et l’invraisemblable', () => {
    const p = normaliserProposition({ ...brut, type: 'cadeau', date: '2031-01-01', tiers_confiance: 0.1, montant_ttc: -4 }, '2026-10-24')
    expect(p).toMatchObject({ type: null, date: null, tiers: null, montant_ttc_cts: null })
    expect(normaliserProposition(null, '2026-10-24').type).toBeNull()
  })
  it('extension', () => {
    expect(extensionDe('Photo.HEIC')).toBe('.heic')
    expect(extensionDe('sans-extension')).toBe('')
    expect(nomEdge({ type: 'ticket', date: '2026-10-21' }, 'a.PDF')).toBe('2026-10-21_TICKET.pdf')
  })
  it('miroir front = Edge : mêmes types, même fichier de règles', () => {
    expect(TYPES_FRONT).toEqual(TYPES_EDGE)
    const edge = readFileSync(new URL('./conventionDocuments.ts', import.meta.url), 'utf8')
    const front = readFileSync(new URL('../../../src/shared/lib/conventionDocuments.ts', import.meta.url), 'utf8')
    expect(front).toBe(edge)
  })
  it('chemins existants sous la racine', () => {
    const d = [
      { id: 'a', name: 'Achats', parents: ['r'] }, { id: 'b', name: 'Carburant', parents: ['a'] }, { id: 'c', name: '2026', parents: ['b'] },
      { id: 'x', name: 'Ailleurs', parents: ['autre'] }, { id: 'v', name: 'Ventes', parents: ['r'] },
    ]
    expect(cheminsExistants(d, 'r')).toEqual([['Achats'], ['Achats', 'Carburant'], ['Achats', 'Carburant', '2026'], ['Ventes']])
    expect(cheminsExistants(d, 'r', 2)).toEqual([['Achats'], ['Achats', 'Carburant'], ['Ventes']])
  })
  it('chemin proposé : noms du Drive repris, niveaux nouveaux marqués', () => {
    const ex = [['Achats'], ['Achats', 'Carburant'], ['Achats', 'Carburant', '2026']]
    expect(normaliserChemin(['achats', 'Carburant', '2026'], ex, ['Autre'])).toEqual({ chemin: ['Achats', 'Carburant', '2026'], nouveaux: [false, false, false] })
    expect(normaliserChemin('Achats / Péages / 2026', ex, ['Autre'])).toEqual({ chemin: ['Achats', 'Péages', '2026'], nouveaux: [false, true, true] })
    expect(normaliserChemin(null, ex, ['Ventes', '2026'])).toEqual({ chemin: ['Ventes', '2026'], nouveaux: [true, true] })
    expect(normaliserChemin(['a/b', '  ', 'x'.repeat(100)], [], ['Autre']).chemin).toEqual(['a-b', 'x'.repeat(60)])
  })
  it('tiers et véhicules rattachés aux fiches', () => {
    const connus = ['ASDIA', 'Société Générale', 'TotalEnergies']
    expect(rapprocherTiers('ASDIA SAS', connus)).toEqual({ nom: 'ASDIA', connu: true })
    expect(rapprocherTiers('Total Energies Marketing France', ['Total'])).toEqual({ nom: 'Total', connu: true })
    expect(rapprocherTiers('Total Energies', connus)).toEqual({ nom: 'TotalEnergies', connu: true })
    expect(rapprocherTiers('Axa', ['Axa Assurances'])).toEqual({ nom: 'Axa', connu: false })
    expect(rapprocherTiers('Boulangerie Müller', connus)).toEqual({ nom: 'Boulangerie Müller', connu: false })
    expect(rapprocherTiers(null, connus)).toEqual({ nom: null, connu: false })
    expect(rapprocherVehicule('ab 123 cd', ['AB-123-CD', 'ZZ-999-ZZ'])).toBe('AB-123-CD')
    expect(rapprocherVehicule('XX', ['AB-123-CD'])).toBeNull()
  })
  it('documents de tournée : rangés d’après la tournée', () => {
    expect(pageDuNom('feuille-de-route-page-3.jpg')).toBe(3)
    expect(pageDuNom('IMG_3794.jpeg')).toBeNull()
    const f = propositionTournee({ nature: 'feuille', date: '2026-10-24', client: 'La Poste', salarie: 'PAUL MARTIN', numero: 2 }, 'feuille-de-route-page-2.jpg')
    expect(f).toMatchObject({ type: 'feuille_de_route', date: '2026-10-24', tiers: 'PAUL MARTIN', reference: 'p2', nom: '2026-10-24_FEUILLE-DE-ROUTE_PAUL-MARTIN_P2.jpg', chemin: ['Transport', 'Tournées de colis', 'Feuilles de route', '2026-10'] })
    const s = propositionTournee({ nature: 'synthese', date: '2026-10-23', client: null, salarie: 'PAUL MARTIN', numero: 1 }, 'IMG_3794.jpeg')
    expect(s).toMatchObject({ type: 'synthese_tournee', tiers: 'PAUL MARTIN', nom: '2026-10-23_SYNTHESE-TOURNEE_PAUL-MARTIN_1.jpeg', chemin: ['Transport', 'Tournées de colis', 'Synthèses de tournée', '2026-10'] })
    const a = propositionTournee({ nature: 'arret', date: null, client: 'La Poste', salarie: null, numero: null, adresse: '12 rue des Lilas, Brumath' }, 'x.jpg')
    expect(a).toMatchObject({ type: 'preuve_livraison', date: null, chemin: ['Transport', 'Tournées de colis', 'Preuves de livraison', 'Sans date'] })
    // Sans salarié connu, le client donne son nom ; deux noms identiques : -2.
    const sansSalarie = propositionTournee({ nature: 'feuille', date: '2026-10-24', client: 'La Poste', salarie: null, numero: 2 }, 'x.jpg')
    expect(sansSalarie.nom).toBe('2026-10-24_FEUILLE-DE-ROUTE_LA-POSTE_P2.jpg')
    const pris = new Set([sansSalarie.nom.toLowerCase()])
    expect(propositionTournee({ nature: 'feuille', date: '2026-10-24', client: 'La Poste', salarie: null, numero: 2 }, 'x.jpg', pris).nom).toBe('2026-10-24_FEUILLE-DE-ROUTE_LA-POSTE_P2-2.jpg')
  })
})
