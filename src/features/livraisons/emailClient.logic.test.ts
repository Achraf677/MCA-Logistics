import { describe, it, expect } from 'vitest'
import {
  composeSubject, composeBody, composeEmail, invoiceAttachmentName,
} from './emailClient.logic'

describe('composeSubject', () => {
  it('avec numéro de facture', () => {
    expect(composeSubject('FA-2026-07-9')).toBe('Facture FA-2026-07-9 — MCA Logistics')
  })
  it('sans numéro → générique', () => {
    expect(composeSubject(null)).toBe('Votre facture — MCA Logistics')
    expect(composeSubject('  ')).toBe('Votre facture — MCA Logistics')
  })
})

describe('composeBody', () => {
  it('nominal : client + numéro + montant + BL joint', () => {
    const body = composeBody({
      invoiceNumber: 'FA-2026-07-9', clientName: 'Boulangerie Dupont',
      amountTtcCts: 22500, hasBl: true,
    })
    expect(body).toContain('Bonjour Boulangerie Dupont,')
    expect(body).toContain('votre facture FA-2026-07-9')
    expect(body).toContain('225,00 € TTC')      // espace insécable FR
    expect(body).toContain('lettre de voiture')
    expect(body).toContain('MCA Logistics')
  })

  it('sans BL → ne mentionne pas la lettre de voiture', () => {
    const body = composeBody({
      invoiceNumber: 'FA-1', clientName: 'X', amountTtcCts: 10000, hasBl: false,
    })
    expect(body).not.toContain('lettre de voiture')
    expect(body).toContain('votre facture FA-1')
  })

  it('sans nom client → "Bonjour,"', () => {
    const body = composeBody({ invoiceNumber: 'FA-1', clientName: null, amountTtcCts: null, hasBl: false })
    expect(body).toContain('Bonjour,')
    expect(body).not.toContain('Bonjour ,')
  })

  it('sans montant → pas de mention de montant', () => {
    const body = composeBody({ invoiceNumber: 'FA-1', clientName: 'X', amountTtcCts: null, hasBl: false })
    expect(body).not.toContain('montant de')
    const body0 = composeBody({ invoiceNumber: 'FA-1', clientName: 'X', amountTtcCts: 0, hasBl: false })
    expect(body0).not.toContain('montant de')
  })

  it('sans numéro → "votre facture" sans numéro', () => {
    const body = composeBody({ invoiceNumber: null, clientName: 'X', amountTtcCts: 5000, hasBl: true })
    expect(body).toContain('votre facture ')
    expect(body).not.toMatch(/facture FA-/)
  })
})

describe('composeEmail', () => {
  it('agrège sujet + corps', () => {
    const r = composeEmail({ invoiceNumber: 'FA-9', clientName: 'X', amountTtcCts: 1000, hasBl: true })
    expect(r.subject).toBe('Facture FA-9 — MCA Logistics')
    expect(r.body).toContain('Bonjour X,')
  })
})

describe('invoiceAttachmentName', () => {
  it('nettoie le numéro pour un nom de fichier sûr', () => {
    expect(invoiceAttachmentName('FA-2026-07-9')).toBe('Facture_FA-2026-07-9.pdf')
    expect(invoiceAttachmentName('FA/2026 07')).toBe('Facture_FA_2026_07.pdf')
    expect(invoiceAttachmentName(null)).toBe('Facture.pdf')
  })
})
