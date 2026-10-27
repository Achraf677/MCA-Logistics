import { describe, expect, it } from 'vitest'
import { analyserDescription, propositionDepuisDescription, suggererTypes, type Referents } from './decrire.logic'
import { nomPropose, origineDuDocument, type Annuaire, type ClasseHistorique } from '../../shared/lib/conventionDocuments'

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
    expect(lire('Permis de conduire Jean Dupont')).toMatchObject({ type: 'permis', tiers: 'Jean Dupont', tiersConnu: true, date: null, reference: null, vehicule: null, partie: null })
    expect(lire('carte d\'identité dupont jean')).toMatchObject({ type: 'identite', tiers: 'Jean Dupont' })
    expect(lire('casier judiciaire de Marie')).toMatchObject({ type: 'casier', tiers: 'Marie Durand' })
  })
  it('facture : fournisseur connu, référence et date', () => {
    expect(lire('facture Leclerc 12345 du 5 octobre')).toMatchObject({ type: 'facture_fournisseur', tiers: 'E.Leclerc', date: '2026-10-05', reference: '12345', vehicule: null })
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

describe('souplesse : ordre libre, fautes, abréviations, verso, montant, plusieurs dates', () => {
  it('ordre des mots libre', () => {
    expect(lire('Jean Dupont permis')).toMatchObject({ type: 'permis', tiers: 'Jean Dupont' })
    expect(lire('12345 Leclerc facture')).toMatchObject({ type: 'facture_fournisseur', tiers: 'E.Leclerc', reference: '12345' })
  })
  it('fautes de frappe sur les mots-clés (1 lettre)', () => {
    expect(lire('permi de conduir Jean Dupont')).toMatchObject({ type: 'permis', tiers: 'Jean Dupont' })
    expect(lire('facure Leclerc 12345')).toMatchObject({ type: 'facture_fournisseur', tiers: 'E.Leclerc' })
    expect(lire('atestation assurence')?.type).toBe('assurance')
  })
  it('les noms des fiches ne sont pas « corrigés » en mots-clés', () => {
    expect(lire('devis Garage Gamma')).toMatchObject({ type: 'devis', tiers: 'Garage Gamma' })
  })
  it('abréviations courantes', () => {
    expect(lire('CT ab-123-cd')).toMatchObject({ type: 'controle_technique', vehicule: 'AB-123-CD' })
    expect(lire('CG ef456gh')).toMatchObject({ type: 'carte_grise', vehicule: 'EF-456-GH' })
    expect(lire('FDR 5 octobre')).toMatchObject({ type: 'feuille_de_route', date: '2026-10-05' })
    expect(lire('BL Beta')).toMatchObject({ type: 'bon_livraison', tiers: 'Beta Express' })
    expect(lire('LV Alpha')?.type).toBe('lettre_de_voiture')
  })
  it('prénom seul ou nom seul quand il est unique', () => {
    expect(lire('le permis de Marie')).toMatchObject({ type: 'permis', tiers: 'Marie Durand' })
    expect(lire('permis dupont')).toMatchObject({ tiers: 'Jean Dupont' })
  })
  it('verso, recto, pages', () => {
    expect(lire('c\'est le verso du permis de Jean Dupont')).toMatchObject({ type: 'permis', tiers: 'Jean Dupont', partie: 'VERSO' })
    expect(lire('permis Jean Dupont recto verso')?.partie).toBe('RECTO-VERSO')
    expect(lire('facture Leclerc 12345 page 2')).toMatchObject({ partie: 'P2', reference: '12345' })
    expect(lire('contrat Alpha p3')).toMatchObject({ partie: 'P3', tiers: 'Transports Alpha' })
    expect(lire('annexe contrat Alpha')?.partie).toBe('ANNEXE')
  })
  it('montant : va dans la fiche, pas dans le nom ni la référence', () => {
    const r = lire('ticket Leclerc 12,50 €')
    expect(r).toMatchObject({ type: 'ticket', tiers: 'E.Leclerc', montant_ttc_cts: 1250, reference: null })
    expect(lire('facture Leclerc 12345 pour 150 euros')).toMatchObject({ montant_ttc_cts: 15000, reference: '12345' })
  })
  it('plusieurs dates : la première est celle du document', () => {
    expect(lire('facture Leclerc 12345 du 5 octobre échéance 05/11/2026')).toMatchObject({ date: '2026-10-05', tiers: 'E.Leclerc' })
  })
  it('mots inconnus ou de politesse ne bloquent pas', () => {
    expect(lire('voici le permis de Jean Dupont svp merci')).toMatchObject({ type: 'permis', tiers: 'Jean Dupont' })
  })
})

describe('origine du document : complète sans écraser', () => {
  const annuaire: Annuaire = {
    salaries: { s1: 'Jean Dupont' }, salariesParProfil: { p2: 'Marie Durand' }, vehicules: { v1: 'AB-123-CD' }, clients: { c1: 'Transports Alpha' },
  }
  it('fiche salarié : le permis est à lui sans rien dire', () => {
    const o = origineDuDocument({ entity_type: 'team_member', entity_id: 's1', uploaded_by: 'p2' }, annuaire)
    expect(analyserDescription('le verso du permis', REF, AUJ, { origine: o })).toMatchObject({ type: 'permis', tiers: 'Jean Dupont', tiersConnu: true, partie: 'VERSO', parOrigine: true })
  })
  it('déposé par un salarié : sa pièce personnelle est à lui', () => {
    const o = origineDuDocument({ entity_type: 'depot', uploaded_by: 'p2' }, annuaire)
    expect(analyserDescription('carte d\'identité', REF, AUJ, { origine: o })).toMatchObject({ type: 'identite', tiers: 'Marie Durand', parOrigine: true })
    // …mais une facture déposée par lui ne devient pas « sa » facture.
    expect(analyserDescription('facture', REF, AUJ, { origine: o })?.tiers).toBeNull()
  })
  it('fiche véhicule / client', () => {
    const v = origineDuDocument({ entity_type: 'vehicle', entity_id: 'v1' }, annuaire)
    expect(analyserDescription('amende 3851', REF, AUJ, { origine: v })).toMatchObject({ type: 'amende', vehicule: 'AB-123-CD', parOrigine: true })
    const c = origineDuDocument({ entity_type: 'client', entity_id: 'c1' }, annuaire)
    expect(analyserDescription('devis', REF, AUJ, { origine: c })).toMatchObject({ type: 'devis', tiers: 'Transports Alpha' })
  })
  it('ce que dit la phrase l\'emporte sur l\'origine', () => {
    const o = origineDuDocument({ entity_type: 'team_member', entity_id: 's1' }, annuaire)
    expect(analyserDescription('permis Marie Durand', REF, AUJ, { origine: o })).toMatchObject({ tiers: 'Marie Durand', parOrigine: false })
  })
})

describe('autodidacte : habitudes de l\'utilisateur', () => {
  const classes: ClasseHistorique[] = [
    { type_document: 'facture_fournisseur', tiers: 'E.Leclerc', drive_chemin: 'Comptabilite & finances / Fournisseurs / E.LECLERC' },
    { type_document: 'facture_fournisseur', tiers: 'E.Leclerc', drive_chemin: 'Comptabilite & finances / Fournisseurs / E.LECLERC' },
    { type_document: 'facture_fournisseur', tiers: 'E.Leclerc', drive_chemin: 'Comptabilite & finances / Fournisseurs / E.LECLERC' },
    { type_document: 'ticket', tiers: 'Garage Gamma', drive_chemin: 'Comptabilite & finances / Fournisseurs / GARAGE GAMMA' },
  ]
  it('sans type dans la phrase : le type habituel du tiers', () => {
    expect(analyserDescription('Leclerc 12345', REF, AUJ, { classes })).toMatchObject({ type: 'facture_fournisseur', tiers: 'E.Leclerc', reference: '12345', typeParHabitude: true })
    expect(analyserDescription('Leclerc 12345', REF, AUJ)).toBeNull()
    // un seul document rangé : pas assez pour deviner.
    expect(analyserDescription('Gamma', REF, AUJ, { classes })).toBeNull()
  })
  it('le dossier habituel passe avant la convention', () => {
    const histo: ClasseHistorique[] = [{ type_document: 'facture_client', tiers: 'Transports Alpha', drive_chemin: 'Comptabilite & finances / Clients / ALPHA / 2026-09' }]
    const existants = [['Comptabilite & finances'], ['Comptabilite & finances', 'Clients'], ['Comptabilite & finances', 'Clients', 'ALPHA']]
    const d = analyserDescription('facture Alpha 3 octobre', REF, AUJ, { classes: histo })!
    const p = propositionDepuisDescription(d, { file_name: 'a.pdf', created_at: '2026-10-27T08:00:00Z' }, existants, new Set(), histo)
    expect(p.chemin).toEqual(['Comptabilite & finances', 'Clients', 'ALPHA', '2026-10'])
    expect(p.chemin_via).toBe('habitude')
  })
})

describe('suggestions quand le type n\'est pas reconnu', () => {
  it('3 types proches, puis les plus rangés', () => {
    expect(suggererTypes('relevé de compte')).toContain('releve_bancaire')
    expect(suggererTypes('xyz', [{ type_document: 'devis' }, { type_document: 'devis' }, { type_document: 'avoir' }])).toEqual(['devis', 'avoir', 'facture_fournisseur'])
    expect(suggererTypes('blabla')).toHaveLength(3)
  })
  it('un type imposé par la suggestion', () => {
    expect(analyserDescription('blabla Alpha', REF, AUJ)).toBeNull()
    expect(analyserDescription('blabla Alpha', REF, AUJ, { type: 'devis' })).toMatchObject({ type: 'devis', tiers: 'Transports Alpha' })
  })
})

describe('recto / verso dans le nom', () => {
  it('« partie » : dernier bloc du nom ; deux faces proposées automatiquement', () => {
    expect(nomPropose({ type: 'permis', date: '2026-10-27', tiers: 'Jean Dupont', partie: 'VERSO' }, 'a.jpeg')).toBe('2026-10-27_PERMIS-CONDUIRE_JEAN-DUPONT_VERSO.jpeg')
    const recto = nomPropose({ type: 'permis', date: '2026-10-27', tiers: 'Jean Dupont' }, 'a.jpeg')
    expect(nomPropose({ type: 'permis', date: '2026-10-27', tiers: 'Jean Dupont' }, 'b.jpeg', new Set([recto.toLowerCase()]))).toBe('2026-10-27_PERMIS-CONDUIRE_JEAN-DUPONT_VERSO.jpeg')
    const f = nomPropose({ type: 'facture_fournisseur', date: '2026-10-05', tiers: 'Leclerc', reference: '1' }, 'a.pdf')
    expect(nomPropose({ type: 'facture_fournisseur', date: '2026-10-05', tiers: 'Leclerc', reference: '1' }, 'b.pdf', new Set([f.toLowerCase()]))).toBe('2026-10-05_FACTURE_LECLERC_1_P2.pdf')
  })
})
