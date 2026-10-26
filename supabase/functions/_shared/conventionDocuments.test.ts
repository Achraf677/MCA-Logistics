// Banc d'essai de la convention de nommage / classement : chaque cas est un VRAI fichier du Drive de MCA Logistics
// (nom officiel rangé par l'utilisateur) ou un exemple du Google Doc « CONVENTION DE NOMMAGE & CIRCUIT ».
import { describe, expect, it } from 'vitest'
import { cheminConvention, cheminDefaut, nomPropose, salarieDuNom, typeSensibleDuNom, dossierVehicule } from './conventionDocuments'

// Dossiers réels (extrait) de « MCA Documents ».
const DRIVE: string[][] = [
  ['Comptabilite & finances'], ['Comptabilite & finances', 'Clients'],
  ['Comptabilite & finances', 'Clients', 'CLIENT B TRANSPORT'], ['Comptabilite & finances', 'Clients', 'CLIENTA'],
  ['Comptabilite & finances', 'Fournisseurs'], ['Comptabilite & finances', 'Fournisseurs', 'ORGANISME'],
  ['Vehicules et Flotte'], ['Vehicules et Flotte', 'RENAULT TRAFIC AB-123-CD'], ['Vehicules et Flotte', 'FORD TRANSIT EF-456-GH'],
  ['Assurances'], ['Assurances', 'Flotte automobile'], ['Assurances', 'Flotte automobile', 'FORD TRANSIT EF-456-GH'],
]

interface Cas { nom: string; e: Parameters<typeof nomPropose>[0]; src?: string }

// [nom officiel du Drive, éléments que l'IA lit sur le document]
const NOMS: Cas[] = [
  { nom: '2026-09-25_AVIS-PAIEMENT_CLIENTD_0000000002.pdf', e: { type: 'avis_paiement', date: '2026-09-25', tiers: 'CLIENTD', reference: '0000000002' } },
  { nom: '2026-07-10_AMENDE_ORGANISMEA_0000000001.pdf', e: { type: 'amende', date: '2026-07-10', tiers: 'ORGANISMEA', reference: '0000000001' } },
  { nom: '2026-06-09_FACTURE_E.LECLERC_12345.pdf', e: { type: 'facture_fournisseur', date: '2026-06-09', tiers: 'E.Leclerc', reference: '12345' } },
  { nom: '2026-09-01_BON-LIVRAISON_CLIENT-C_22388990.pdf', e: { type: 'bon_livraison', date: '2026-09-01', tiers: 'Client C', reference: '22388990' } },
  { nom: '2026-10-12_FACTURE_ORGANISME_PAIEMENT-RBE.pdf', e: { type: 'facture_fournisseur', date: '2026-10-12', tiers: 'ORGANISME', reference: 'Paiement RBE' } },
  { nom: '2026-05-31_DECLARATION_TVA-CA3_05-2026.pdf', e: { type: 'fiscal_social', date: '2026-05-31', tiers: 'TVA CA3', reference: '05-2026' } },
  { nom: '2026-05-28_LICENCE_TRANSPORT_2026-00-0000000.pdf', e: { type: 'licence', date: '2026-05-28', tiers: 'Transport', reference: '2026-00-0000000' } },
  { nom: '2026-09-17_APPEL-COTISATION_ASSUREURX_AF000000001.pdf', e: { type: 'document_vehicule', date: '2026-09-17', tiers: 'AssureurX', reference: 'AF000000001' }, src: 'type « appel de cotisation » absent de la liste : voir plus bas' },
  // Intemporels : pas de date imprimée → pas de date dans le nom (même avec une date de dépôt).
  { nom: 'KBIS_MCA-LOGISTICS.pdf', e: { type: 'kbis', tiers: 'MCA Logistics', dateDepot: '2026-10-26' } },
  { nom: 'STATUTS_MCA-LOGISTICS.pdf', e: { type: 'statuts', tiers: 'MCA Logistics', dateDepot: '2026-10-26' } },
  { nom: 'RIB_QONTO_COMPTE-PRINCIPAL.pdf', e: { type: 'rib', tiers: 'Qonto', reference: 'Compte principal' } },
  // Date imprimée absente, document daté : date du dépôt.
  { nom: '2026-10-26_AMENDE_ORGANISMEA.pdf', e: { type: 'amende', tiers: 'ORGANISMEA', dateDepot: '2026-10-26' } },
  // Pièces d'identité.
  { nom: '2026-10-24_CNI_JEAN-DUPONT.jpeg', e: { type: 'identite', date: '2026-10-24', tiers: 'Jean Dupont' } },
]

describe('convention : nom du fichier', () => {
  for (const c of NOMS.filter(x => !x.src)) {
    it(c.nom, () => expect(nomPropose(c.e, c.nom.replace(/^.*(\.[a-z]+)$/, 'scan$1'))).toBe(c.nom))
  }
  it('le montant ne figure jamais dans le nom', () => {
    expect(nomPropose({ type: 'ticket', date: '2026-10-21', tiers: "O'TACOS", montant_ttc_cts: 1750 }, 'IMG_2231.JPG')).toBe('2026-10-21_TICKET_O-TACOS.jpg')
  })
  it('sans date ni dépôt, un type daté n\'a pas de date non plus', () => {
    expect(nomPropose({ type: 'facture_fournisseur', tiers: 'Société Générale Énergies' }, 'a.pdf')).toBe('FACTURE_SOCIETE-GENERALE-ENERGIES.pdf')
  })
  it('jamais deux noms identiques', () => {
    const pris = new Set(['2026-10-21_ticket_super-u.pdf'])
    expect(nomPropose({ type: 'ticket', date: '2026-10-21', tiers: 'Super U' }, 'x.pdf', pris)).toBe('2026-10-21_TICKET_SUPER-U-2.pdf')
  })
})

describe('convention : dossier officiel (tableau « Où je classe »)', () => {
  it('facture client → Clients / CLIENT / mois, en reprenant le dossier existant', () => {
    expect(cheminConvention({ type: 'facture_client', date: '2026-10-05', tiers: 'Client B Transport' }, DRIVE)).toEqual(['Comptabilite & finances', 'Clients', 'CLIENT B TRANSPORT', '2026-10'])
    expect(cheminConvention({ type: 'bon_livraison', date: '2026-07-07', tiers: 'CLIENTA' }, DRIVE)).toEqual(['Comptabilite & finances', 'Clients', 'CLIENTA', '2026-07'])
  })
  it('facture fournisseur → Fournisseurs / FOURNISSEUR', () => {
    expect(cheminConvention({ type: 'facture_fournisseur', date: '2026-10-12', tiers: 'ORGANISME' }, DRIVE)).toEqual(['Comptabilite & finances', 'Fournisseurs', 'ORGANISME'])
  })
  it('amende → dossier du véhicule (nom réel « MARQUE MODELE PLAQUE ») / Amendes', () => {
    expect(cheminConvention({ type: 'amende', date: '2026-07-10', vehicule: 'AB-123-CD' }, DRIVE)).toEqual(['Vehicules et Flotte', 'RENAULT TRAFIC AB-123-CD', 'Amendes'])
    expect(cheminConvention({ type: 'amende', date: '2026-07-10' }, DRIVE)).toBeNull()
  })
  it('avis de paiement : d\'une amende (véhicule) ou d\'un client', () => {
    expect(cheminConvention({ type: 'avis_paiement', date: '2026-09-25', tiers: 'CLIENTD' }, DRIVE)).toEqual(['Comptabilite & finances', 'Clients', 'CLIENTD', '2026-09'])
    expect(cheminConvention({ type: 'avis_paiement', date: '2026-09-25', tiers: 'ORGANISMEA', vehicule: 'EF-456-GH' }, DRIVE)).toEqual(['Vehicules et Flotte', 'FORD TRANSIT EF-456-GH', 'Amendes'])
  })
  it('documents véhicule et assurance', () => {
    expect(cheminConvention({ type: 'carte_grise', vehicule: 'EF-456-GH' }, DRIVE)).toEqual(['Vehicules et Flotte', 'FORD TRANSIT EF-456-GH', 'Carte grise'])
    expect(cheminConvention({ type: 'assurance', vehicule: 'EF-456-GH' }, DRIVE)).toEqual(['Assurances', 'Flotte automobile', 'FORD TRANSIT EF-456-GH'])
    expect(cheminConvention({ type: 'assurance' }, DRIVE)).toEqual(['Assurances'])
  })
  it('administratif', () => {
    expect(cheminConvention({ type: 'kbis' })).toEqual(['Identite Legale', 'KBis et RBE'])
    expect(cheminConvention({ type: 'statuts' })).toEqual(['Statuts et Actes', 'Statuts en vigueur'])
    expect(cheminConvention({ type: 'fiscal_social', date: '2026-05-31' })).toEqual(['Fiscal', 'Documents', '2026'])
    expect(cheminConvention({ type: 'licence', date: '2026-05-28' })).toEqual(['Transport et Reglementaire', 'Licence de Transport'])
    expect(cheminConvention({ type: 'paie', tiers: 'Marie Durand' })).toEqual(['Social et RH', 'Salaries', 'MARIE DURAND'])
    expect(cheminConvention({ type: 'codes_acces' })).toEqual(['Sécurité'])
  })
  it('aucune règle : transit « A traiter »', () => {
    expect(cheminConvention({ type: 'autre' })).toBeNull()
    expect(cheminDefaut({ type: 'photo' })).toEqual(['A traiter'])
  })
  it('véhicule inconnu du Drive : la plaque sert de nom de dossier', () => {
    expect(dossierVehicule('ZZ-999-ZZ', ['Vehicules et Flotte'], DRIVE)).toBe('ZZ-999-ZZ')
  })
})

describe('convention : pièces sensibles reconnues d\'après le nom (jamais envoyées à l\'IA)', () => {
  const cas: Array<[string, string | null]> = [
    ['Carte identité MARTIN PAUL.pdf', 'identite'], ['Carte d\'identité MARTIN PIERRE', 'identite'], ['2026-10-24_CNI_JEAN-DUPONT_1.jpeg', 'identite'],
    ['Permis de conduire MARTIN PAUL.pdf', 'permis'], ['2024-05-27_Permis-Conduire_MARIE-DURAND_000000.jpeg', 'permis'],
    ['Casier Judiciaire MARTIN PAUL.pdf', 'casier'], ['ATTESTATION DE NON-CONDAMNATION.pdf', 'casier'],
    ['Carte-Vitale_LEA-MOREAU.jpeg', 'carte_vitale'], ['Codes d\'accès.xlsx', 'codes_acces'], ['Codes_Secours_Hostinger.txt', 'codes_acces'],
    ['2026-09-17_APPEL-COTISATION_ASSUREURX_AF000000001.pdf', null], ['IMG_3794.jpeg', null], ['Facture_permissions.pdf', null],
  ]
  for (const [nom, type] of cas) it(`${nom} → ${type ?? 'lu par l\'IA'}`, () => expect(typeSensibleDuNom(nom)).toBe(type))
  it('salarié retrouvé dans le nom', () => {
    expect(salarieDuNom('2026-10-24_CNI_JEAN-DUPONT_1.jpeg', ['Marie Durand', 'Jean Dupont'])).toBe('Jean Dupont')
    expect(salarieDuNom('IMG_3794.jpeg', ['Marie Durand'])).toBeNull()
  })
})
