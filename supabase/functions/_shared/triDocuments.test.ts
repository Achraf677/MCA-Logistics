import { describe, expect, it } from 'vitest'
import { extensionDe, lisible, nomPropose as nomEdge, normaliserProposition, TYPES_DOCUMENT as TYPES_EDGE } from './triDocuments'
import { nomPropose as nomFront, TYPES_DOCUMENT as TYPES_FRONT } from '../../../src/shared/lib/documentsTri'

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
  it('nom rangé : date, type, tiers, référence, montant', () => {
    expect(nomEdge({ date: '2026-10-21', type: 'ticket', tiers: "O'TACOS", montant_ttc_cts: 1750 }, 'IMG_2231.JPG')).toBe('2026-10-21_Ticket-recu_O-TACOS_17,50EUR.jpg')
    expect(nomEdge({ type: 'facture_fournisseur', tiers: 'Société Générale Énergies' }, 'a.pdf')).toBe('sans-date_Facture-fournisseur_Societe-Generale-Energie.pdf')
  })
  it('jamais deux noms identiques', () => {
    const pris = new Set(['2026-10-21_ticket-recu_super-u.pdf'])
    expect(nomEdge({ date: '2026-10-21', type: 'ticket', tiers: 'Super U' }, 'x.pdf', pris)).toBe('2026-10-21_Ticket-recu_Super-U-2.pdf')
  })
  it('outils', () => {
    expect(lisible('  Été / 2026 ')).toBe('Ete-2026')
    expect(extensionDe('Photo.HEIC')).toBe('.heic')
    expect(extensionDe('sans-extension')).toBe('')
  })
  it('miroir front = Edge', () => {
    expect(TYPES_FRONT).toEqual(TYPES_EDGE)
    const e = { date: '2026-10-21', type: 'devis', tiers: 'ASDIA', montant_ttc_cts: 99900, reference: 'D-2026-014' }
    expect(nomFront(e, 'scan.pdf')).toBe(nomEdge(e, 'scan.pdf'))
  })
})
