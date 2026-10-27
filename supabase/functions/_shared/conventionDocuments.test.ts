// Banc d'essai de la convention de nommage / classement : chaque cas est un VRAI fichier du Drive de MCA Logistics
// (nom officiel rangé par l'utilisateur) ou un exemple du Google Doc « CONVENTION DE NOMMAGE & CIRCUIT ».
import { describe, expect, it } from 'vitest'
import {
  cheminConvention, cheminDefaut, nomPropose, salarieDuNom, typeSensibleDuNom, dossierVehicule, partieDuTexte, cheminHabituel, typeHabituel, exemplesRangement,
  completerDepuisOrigine, origineDuDocument, choisirChemin, estNomConforme, origineDuDossier, dossierConfidentiel, type ClasseHistorique,
} from './conventionDocuments'

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

describe('partie : recto, verso, pages', () => {
  const cas: Array<[string, string | null]> = [
    ['permis verso.jpg', 'VERSO'], ['carte identité recto', 'RECTO'], ['recto verso', 'RECTO-VERSO'], ['recto et verso', 'RECTO-VERSO'],
    ['feuille-de-route-page-3.jpg', 'P3'], ['facture p2', 'P2'], ['suite du contrat', 'SUITE'], ['annexes', 'ANNEXE'], ['facture 12345', null],
  ]
  for (const [t, p] of cas) it(`${t} → ${p}`, () => expect(partieDuTexte(t)).toBe(p))
})

describe('origine du document', () => {
  const a = { salaries: { s1: 'Jean Dupont' }, salariesParProfil: { p1: 'Marie Durand' }, vehicules: { v1: 'AB-123-CD' }, clients: { c1: 'Client A' } }
  it('lit la fiche d\'où vient le document', () => {
    expect(origineDuDocument({ entity_type: 'team_member', entity_id: 's1', uploaded_by: 'p1' }, a)).toEqual({ salarie: 'Jean Dupont', vehicule: null, client: null, deposePar: 'Marie Durand' })
    expect(origineDuDocument({ entity_type: 'vehicle', entity_id: 'v1' }, a).vehicule).toBe('AB-123-CD')
    expect(origineDuDocument({ entity_type: 'delivery', entity_id: 'd1' }, a, 'Client A').client).toBe('Client A')
    expect(origineDuDocument({ entity_type: 'depot' }, a)).toEqual({ salarie: null, vehicule: null, client: null, deposePar: null })
  })
  it('complète les cases vides, jamais ce qui est dit', () => {
    const o = { salarie: 'Jean Dupont', vehicule: 'AB-123-CD', client: 'Client A', deposePar: null }
    expect(completerDepuisOrigine({ type: 'permis' }, o)).toEqual({ tiers: 'Jean Dupont', vehicule: null, parOrigine: true })
    expect(completerDepuisOrigine({ type: 'permis', tiers: 'Marie Durand' }, o)).toEqual({ tiers: 'Marie Durand', vehicule: null, parOrigine: false })
    expect(completerDepuisOrigine({ type: 'amende' }, o)).toEqual({ tiers: null, vehicule: 'AB-123-CD', parOrigine: true })
    expect(completerDepuisOrigine({ type: 'devis' }, o)).toEqual({ tiers: 'Client A', vehicule: null, parOrigine: true })
    expect(completerDepuisOrigine({ type: 'facture_fournisseur' }, o).tiers).toBeNull()
  })
})

describe('habitudes : ce qui a déjà été rangé', () => {
  const h = (type: string, tiers: string, chemin: string): ClasseHistorique => ({ type_document: type, tiers, drive_chemin: chemin })
  const EX = [['Comptabilite & finances'], ['Comptabilite & finances', 'Clients'], ['Comptabilite & finances', 'Clients', 'CLIENT A'], ['Comptabilite & finances', 'Fournisseurs'], ['Comptabilite & finances', 'Fournisseurs', 'GARAGE G']]
  it('dossier le plus fréquent, dossier de mois suivi', () => {
    const classes = [
      h('facture_client', 'Client A', 'Comptabilite & finances / Clients / CLIENT A / 2026-09'),
      h('facture_client', 'client a', 'Comptabilite & finances / Clients / CLIENT A / 2026-08'),
      h('facture_client', 'Client A', 'Comptabilite & finances / Clients / ANCIEN / 2026-01'),
    ]
    expect(cheminHabituel(classes, { type: 'facture_client', tiers: 'CLIENT A', date: '2026-10-05' }, EX)).toEqual(['Comptabilite & finances', 'Clients', 'CLIENT A', '2026-10'])
    expect(cheminHabituel(classes, { type: 'facture_client', tiers: 'CLIENT A' }, EX)).toEqual(['Comptabilite & finances', 'Clients', 'CLIENT A', 'Sans date'])
  })
  it('dossier disparu du Drive, autre tiers ou autre type : pas d\'habitude', () => {
    const classes = [h('facture_client', 'Client A', 'Comptabilite & finances / Clients / SUPPRIME / 2026-09')]
    expect(cheminHabituel(classes, { type: 'facture_client', tiers: 'Client A', date: '2026-10-05' }, EX)).toBeNull()
    expect(cheminHabituel(classes, { type: 'devis', tiers: 'Client A' }, [])).toBeNull()
    expect(cheminHabituel(classes, { type: 'facture_client', tiers: 'Client B' }, [])).toBeNull()
    expect(cheminHabituel(classes, { type: 'facture_client', tiers: null }, [])).toBeNull()
  })
  it('sans Drive connu, l\'habitude est reprise telle quelle', () => {
    const classes = [h('ticket', 'Garage G', 'Comptabilite & finances / Fournisseurs / GARAGE G')]
    expect(cheminHabituel(classes, { type: 'ticket', tiers: 'Garage G' }, [])).toEqual(['Comptabilite & finances', 'Fournisseurs', 'GARAGE G'])
  })
  it('type habituel d\'un tiers : au moins 2 documents et 70 %', () => {
    const f = h('facture_fournisseur', 'Garage G', 'x')
    expect(typeHabituel([f, f, f], 'garage g')).toBe('facture_fournisseur')
    expect(typeHabituel([f], 'Garage G')).toBeNull()
    expect(typeHabituel([f, f, h('devis', 'Garage G', 'x')], 'Garage G')).toBeNull()
    expect(typeHabituel([f, f], null)).toBeNull()
  })
  it('exemples pour l\'IA : distincts, sans pièces personnelles, dates généralisées', () => {
    const classes = [
      h('facture_client', 'Client A', 'Comptabilite & finances / Clients / CLIENT A / 2026-09'),
      h('facture_client', 'Client A', 'Comptabilite & finances / Clients / CLIENT A / 2026-08'),
      h('permis', 'Jean Dupont', 'Social et RH / Salaries / JEAN DUPONT'),
      h('paie', 'Jean Dupont', 'Comptabilite & finances / Paie'),
      h('ticket', 'Garage G', 'Comptabilite & finances / Fournisseurs / GARAGE G'),
      h('devis', '', 'Comptabilite & finances / Clients'),
    ]
    expect(exemplesRangement(classes)).toEqual([
      'Facture client · Client A → Comptabilite & finances / Clients / CLIENT A / AAAA-MM',
      'Ticket / reçu · Garage G → Comptabilite & finances / Fournisseurs / GARAGE G',
    ])
    expect(exemplesRangement(classes, 1)).toHaveLength(1)
  })
  it('dossier choisi : habitude, puis convention (avec l\'origine), sinon rien', () => {
    const classes = [h('facture_client', 'Client A', 'Comptabilite & finances / Clients / CLIENT A / 2026-09')]
    expect(choisirChemin({ type: 'facture_client', tiers: 'Client A', date: '2026-10-05' }, { classes, existants: EX })).toMatchObject({ via: 'habitude', chemin: ['Comptabilite & finances', 'Clients', 'CLIENT A', '2026-10'] })
    expect(choisirChemin({ type: 'facture_fournisseur', tiers: 'Garage G' }, { existants: EX })).toMatchObject({ via: 'convention', chemin: ['Comptabilite & finances', 'Fournisseurs', 'GARAGE G'] })
    expect(choisirChemin({ type: 'amende', vehicule: 'AB-123-CD', parOrigine: true }, {})).toMatchObject({ via: 'origine' })
    expect(choisirChemin({ type: 'autre' }, {})).toBeNull()
  })
})

describe('fichiers déjà dans le Drive : nom conforme ?', () => {
  const oui = ['2026-06-09_FACTURE_E.LECLERC_12345.pdf', 'KBIS_MCA-LOGISTICS.pdf', '2026-10-24_CNI_JEAN-DUPONT_VERSO.jpeg', 'RIB_BANQUE_COMPTE-PRINCIPAL.pdf', '2026-10-21_TICKET_SUPER-U-2.pdf']
  const non = ['Carte identité DUPONT.pdf', 'IMG_3794.jpeg', '2026-09_DECLARATION_TVA-CA3.pdf', 'facture leclerc.pdf', '2026-10-02-2026-10-01-RECAP-TOURNEE_CLIENT-B_53-COLIS.jpg', 'STATUTS.pdf', '2026-06-09_facture_E.LECLERC.pdf', '']
  for (const n of oui) it(`conforme : ${n}`, () => expect(estNomConforme(n)).toBe(true))
  for (const n of non) it(`à renommer : ${n || '(vide)'}`, () => expect(estNomConforme(n)).toBe(false))
})

describe('fichiers du Drive : origine d\'après le dossier, dossiers confidentiels', () => {
  it('client, fournisseur, véhicule, salarié', () => {
    expect(origineDuDossier(['MCA Documents', 'Comptabilite & finances', 'Clients', 'CLIENTA', '2026-07'])).toMatchObject({ client: 'CLIENTA' })
    expect(origineDuDossier(['MCA Documents', 'Comptabilite & finances', 'Fournisseurs', 'ORGANISME'])).toMatchObject({ fournisseur: 'ORGANISME', client: null })
    expect(origineDuDossier(['MCA Documents', 'Vehicules et Flotte', 'RENAULT TRAFIC AB-123-CD', 'Amendes'])).toMatchObject({ vehicule: 'AB-123-CD' })
    expect(origineDuDossier(['MCA Documents', 'Assurances', 'Flotte automobile', 'FORD TRANSIT EF-456-GH'])).toMatchObject({ vehicule: 'EF-456-GH' })
    expect(origineDuDossier(['MCA Documents', 'Social et RH', 'Salaries', 'DUPONT JEAN'])).toMatchObject({ salarie: 'DUPONT JEAN' })
    expect(origineDuDossier(['MCA Documents', 'Fiscal'])).toEqual({ client: null, fournisseur: null, vehicule: null, salarie: null })
  })
  it('dossiers où l\'IA ne lit jamais', () => {
    expect(dossierConfidentiel(['MCA Documents', 'Social et RH', 'Salaries', 'DUPONT JEAN'])).toBe(true)
    expect(dossierConfidentiel(['MCA Documents', 'Direction', 'Jean DUPONT'])).toBe(true)
    expect(dossierConfidentiel(['MCA Documents', 'Sécurité'])).toBe(true)
    expect(dossierConfidentiel(['MCA Documents', 'Comptabilite & finances', 'Clients'])).toBe(false)
  })
})
