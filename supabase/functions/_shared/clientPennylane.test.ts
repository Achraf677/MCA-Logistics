import { describe, it, expect } from 'vitest'
import {
  paysOuFrance, tvaNormalisee, sirenDepuis, payloadClientPennylane, ligneClientSync,
} from './clientPennylane'
import type { ClientLocal, ClientPennylane } from './clientPennylane'

const up = (n: string) => n.trim().toUpperCase()

const pl = (p: Partial<ClientPennylane> = {}): ClientPennylane => ({
  id: 42, name: 'Colis Privé', reg_no: '102898095', vat_number: 'FR 12 102898095',
  emails: ['pl@exemple.fr'], phone: '0388', billing_address: {
    address: '1 rue PL', postal_code: '67000', city: 'Strasbourg', country_alpha2: 'FR',
  }, ...p,
})

const local = (p: Partial<ClientLocal> = {}): ClientLocal => ({
  name: 'COLIS PRIVÉ STRASBOURG', type: 'professionnel', email: 'local@exemple.fr', phone: null,
  address: null, city: null, postal_code: null, siret: '10289809500017', siren: null,
  tva_intra: 'FR12102898095', pays: 'FR', active: true, ...p,
})

describe('normalisations', () => {
  it('pays : ISO alpha-2 sinon FR', () => {
    expect(paysOuFrance('de')).toBe('DE')
    expect(paysOuFrance('')).toBe('FR')
    expect(paysOuFrance(null)).toBe('FR')
    expect(paysOuFrance('FRA')).toBe('FR')
  })
  it('TVA : sans espaces, majuscules', () => {
    expect(tvaNormalisee(' de 123 456 789 ')).toBe('DE123456789')
    expect(tvaNormalisee('')).toBeNull()
  })
  it('SIREN : 9 chiffres, ou les 9 premiers d’un SIRET', () => {
    expect(sirenDepuis('102 898 095')).toBe('102898095')
    expect(sirenDepuis('10289809500017')).toBe('102898095')
    expect(sirenDepuis('12345')).toBeNull()
  })
})

describe('payloadClientPennylane (facture ET devis)', () => {
  it('client UE : pays et TVA envoyés', () => {
    const p = payloadClientPennylane({
      id: 'c1', name: 'Kunde GmbH', email: null, address: 'Hauptstr. 1', postal_code: '77694',
      city: 'Kehl', pays: 'DE', tva_intra: 'de123456789',
    })
    expect(p.billing_address.country_alpha2).toBe('DE')
    expect(p.vat_number).toBe('DE123456789')
    expect(p.emails).toEqual([])
  })
  it('client FR sans TVA : pas de vat_number', () => {
    const p = payloadClientPennylane({ id: 'c2', name: 'X', email: 'a@b.fr', address: null, postal_code: null, city: null })
    expect(p.billing_address.country_alpha2).toBe('FR')
    expect('vat_number' in p).toBe(false)
  })
})

describe('ligneClientSync (le site gagne)', () => {
  it('client connu : nom, SIRET, TVA, e-mail locaux conservés ; SIREN rangé à part', () => {
    const l = ligneClientSync(pl(), local(), 'co', up)
    expect(l.name).toBe('COLIS PRIVÉ STRASBOURG')
    expect(l.siret).toBe('10289809500017')
    expect(l.siren).toBe('102898095')
    expect(l.tva_intra).toBe('FR12102898095')
    expect(l.email).toBe('local@exemple.fr')
    // champ local vide : Pennylane le remplit
    expect(l.address).toBe('1 rue PL')
  })
  it('« siret » local de 9 chiffres (ancienne synchro) : rangé en SIREN, SIRET vidé', () => {
    const l = ligneClientSync(pl({ reg_no: null }), local({ siret: '509180709', siren: null }), 'co', up)
    expect(l.siret).toBeNull()
    expect(l.siren).toBe('509180709')
  })
  it('client archivé : reste archivé', () => {
    expect(ligneClientSync(pl(), local({ active: false }), 'co', up).active).toBe(false)
  })
  it('nouveau client : actif, pays de Pennylane, SIREN jamais dans siret', () => {
    const l = ligneClientSync(pl({ billing_address: { address: null, postal_code: null, city: null, country_alpha2: 'BE' } }), null, 'co', up)
    expect(l.active).toBe(true)
    expect(l.pays).toBe('BE')
    expect(l.siret).toBeNull()
    expect(l.siren).toBe('102898095')
    expect(l.type).toBe('professionnel')
    expect(l.name).toBe('COLIS PRIVÉ')
  })
  it('toutes les lignes ont les mêmes colonnes (upsert groupé)', () => {
    const a = Object.keys(ligneClientSync(pl(), null, 'co', up)).sort()
    const b = Object.keys(ligneClientSync(pl(), local(), 'co', up)).sort()
    expect(a).toEqual(b)
  })
})
