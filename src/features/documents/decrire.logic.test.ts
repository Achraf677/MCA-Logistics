import { describe, expect, it } from 'vitest'
import { analyserDescription, propositionDepuisDescription, type Referents } from './decrire.logic'

// Données FICTIVES uniquement.
const REF: Referents = {
  clients: ['Transports Alpha', 'Beta Express'],
  fournisseurs: ['E.Leclerc', 'Garage Gamma'],
  salaries: ['Jean Dupont', 'Marie Durand'],
  plaques: ['AB-123-CD', 'EF-456-GH'],
}
const AUJ = '2026-10-27'
const lire = (t: string) => analyserDescription(t, REF, AUJ)

describe('analyserDescription : « Dis-moi ce que c\'est »', () => {
  it('pièce de salarié : type + salarié connu', () => {
    expect(lire('Permis de conduire Jean Dupont')).toEqual({ type: 'permis', tiers: 'Jean Dupont', date: null, reference: null, vehicule: null })
    expect(lire('carte d\'identité dupont jean')).toMatchObject({ type: 'identite', tiers: 'Jean Dupont' })
    expect(lire('casier judiciaire de Marie')).toMatchObject({ type: 'casier', tiers: 'Marie Durand' })
  })
  it('facture : fournisseur connu, référence et date', () => {
    expect(lire('facture Leclerc 12345 du 5 octobre')).toEqual({ type: 'facture_fournisseur', tiers: 'E.Leclerc', date: '2026-10-05', reference: '12345', vehicule: null })
  })
  it('facture d\'un client connu → facture client', () => {
    expect(lire('facture Alpha 2026-0042 12/09/2026')).toMatchObject({ type: 'facture_client', tiers: 'Transports Alpha', date: '2026-09-12', reference: '2026-0042' })
  })
  it('tiers inconnu : le texte restant, en majuscules', () => {
    expect(lire('devis boulangerie Muller')).toMatchObject({ type: 'devis', tiers: 'BOULANGERIE MULLER' })
    expect(lire('facture')).toMatchObject({ type: 'facture_fournisseur', tiers: null })
  })
  it('véhicule : plaque de la flotte ou plaque lue', () => {
    expect(lire('amende 3851-0001 ab123cd')).toMatchObject({ type: 'amende', vehicule: 'AB-123-CD', reference: '3851-0001' })
    expect(lire('contrôle technique zz-999-zz')).toMatchObject({ type: 'controle_technique', vehicule: 'ZZ-999-ZZ', tiers: null })
  })
  it('dates : jour + mois (an en cours ou dernier), numérique, mois seul', () => {
    expect(lire('devis Alpha 5 octobre')?.date).toBe('2026-10-05')
    expect(lire('devis Alpha 5 décembre')?.date).toBe('2025-12-05')
    expect(lire('devis Alpha 1er mars 2026')?.date).toBe('2026-03-01')
    expect(lire('devis Alpha 05/10/26')?.date).toBe('2026-10-05')
    expect(lire('devis Alpha octobre 2026')?.date).toBe('2026-10-01')
    expect(lire('devis Alpha 31/02/2026')?.date).toBeNull()
  })
  it('types courants', () => {
    const cas: Array<[string, string]> = [
      ['carte grise ab-123-cd', 'carte_grise'], ['kbis', 'kbis'], ['statuts de la société', 'statuts'], ['RIB Qonto', 'rib'], ['bulletin de paie Marie Durand', 'paie'],
      ['attestation assurance', 'assurance'], ['contrat de travail Jean Dupont', 'dpae'], ['déclaration TVA mai 2026', 'fiscal_social'], ['ticket carburant', 'ticket'],
      ['avoir Alpha', 'avoir'], ['bon de livraison Beta', 'bon_livraison'], ['licence de transport', 'licence'], ['carte vitale Jean Dupont', 'carte_vitale'],
    ]
    for (const [texte, type] of cas) expect(lire(texte)?.type, texte).toBe(type)
  })
  it('type introuvable : rien à appliquer', () => {
    expect(lire('blabla xyz')).toBeNull()
    expect(lire('')).toBeNull()
  })
})

describe('propositionDepuisDescription : nom et dossier de la convention, sans IA', () => {
  const dossiers = [['Social et RH'], ['Social et RH', 'Salaries'], ['Social et RH', 'Salaries', 'JEAN DUPONT']]
  it('permis de Jean Dupont', () => {
    const d = analyserDescription('permis de conduire Jean Dupont', REF, AUJ)!
    const p = propositionDepuisDescription(d, { file_name: 'IMG_1.jpeg', created_at: '2026-10-27T08:00:00Z' }, dossiers)
    expect(p.nom).toBe('2026-10-27_PERMIS-CONDUIRE_JEAN-DUPONT.jpeg')
    expect(p.chemin).toEqual(['Social et RH', 'Salaries', 'JEAN DUPONT'])
    expect(p.chemin_nouveaux).toEqual([false, false, false])
    expect(p.lu_via).toBe('saisie')
  })
  it('facture fournisseur : référence dans le nom, nouveau dossier signalé', () => {
    const d = analyserDescription('facture Leclerc 12345 du 5 octobre', REF, AUJ)!
    const p = propositionDepuisDescription(d, { file_name: 'scan.pdf', created_at: '2026-10-27T08:00:00Z' }, [])
    expect(p.nom).toBe('2026-10-05_FACTURE_E.LECLERC_12345.pdf')
    expect(p.chemin).toEqual(['Comptabilite & finances', 'Fournisseurs', 'E.LECLERC'])
    expect(p.chemin_nouveaux).toEqual([true, true, true])
  })
})
