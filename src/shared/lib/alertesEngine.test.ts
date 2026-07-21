import { describe, it, expect } from 'vitest'
import {
  buildAlertes, resumeAlertes, joursEcoules, joursRestants,
} from './alertesEngine'
import type { ARapprocherCounts } from './aRapprocher'

const TODAY = new Date(2026, 6, 21) // 2026-07-21 (mois 0-indexé)

const emptyRapprocher: ARapprocherCounts = {
  tresorerie: 0, charges: 0, encaissements: 0, categorisation: 0,
  pennylane_supprimees: 0, total: 0,
}

describe('helpers dates', () => {
  it('joursEcoules', () => {
    expect(joursEcoules('2026-07-18', TODAY)).toBe(3)
    expect(joursEcoules('2026-07-21', TODAY)).toBe(0)
    expect(joursEcoules(null, TODAY)).toBeNull()
  })
  it('joursRestants (négatif = dépassé)', () => {
    expect(joursRestants('2026-07-25', TODAY)).toBe(4)
    expect(joursRestants('2026-07-11', TODAY)).toBe(-10)
  })
})

describe('encours clients en retard (date + délai)', () => {
  it('cas 0 : facture dans les délais → aucune alerte', () => {
    const a = buildAlertes({
      facturesImpayees: [
        { id: 'f1', invoiced_at: '2026-07-15', amount_ttc_cts: 10000, payment_terms: 30 },
      ],
    }, TODAY)
    expect(a.find(x => x.id === 'encours-retard')).toBeUndefined()
  })

  it('cas actif : invoiced_at + payment_terms dépassé → rouge + montant cumulé', () => {
    const a = buildAlertes({
      facturesImpayees: [
        // facturée le 2026-06-01, délai 30 j → échéance 07-01, dépassée le 07-21
        { id: 'f1', invoiced_at: '2026-06-01', amount_ttc_cts: 12000, payment_terms: 30 },
        // facturée le 2026-06-10, délai 30 j → échéance 07-10, dépassée
        { id: 'f2', invoiced_at: '2026-06-10', amount_ttc_cts: 8000, payment_terms: 30 },
        // facturée le 2026-07-15, délai 30 j → pas encore dépassée
        { id: 'f3', invoiced_at: '2026-07-15', amount_ttc_cts: 5000, payment_terms: 30 },
      ],
    }, TODAY)
    const al = a.find(x => x.id === 'encours-retard')!
    expect(al.severite).toBe('rouge')
    expect(al.count).toBe(2)
    expect(al.montantCts).toBe(20000)
  })

  it('respecte le délai propre au client (payment_terms court)', () => {
    const a = buildAlertes({
      facturesImpayees: [
        // facturée il y a 10 j, délai 7 j → dépassée
        { id: 'f1', invoiced_at: '2026-07-11', amount_ttc_cts: 3000, payment_terms: 7 },
      ],
    }, TODAY)
    expect(a.find(x => x.id === 'encours-retard')?.count).toBe(1)
  })
})

describe('livrées non facturées > 3 j', () => {
  it('cas 0', () => {
    const a = buildAlertes({
      livreesNonFacturees: [{ id: 'd1', delivered_at: '2026-07-20' }], // 1 j
    }, TODAY)
    expect(a.find(x => x.id === 'livrees-non-facturees')).toBeUndefined()
  })
  it('cas actif → orange', () => {
    const a = buildAlertes({
      livreesNonFacturees: [
        { id: 'd1', delivered_at: '2026-07-10' }, // 11 j
        { id: 'd2', delivered_at: '2026-07-16' }, // 5 j
        { id: 'd3', delivered_at: '2026-07-19' }, // 2 j → non
      ],
    }, TODAY)
    const al = a.find(x => x.id === 'livrees-non-facturees')!
    expect(al.severite).toBe('orange')
    expect(al.count).toBe(2)
  })
})

describe('devis en attente > 14 j', () => {
  it('cas 0 (récent ou statut non en attente)', () => {
    const a = buildAlertes({
      devisEnAttente: [
        { id: 'q1', statut: 'envoye', date: '2026-07-15' },   // 6 j
        { id: 'q2', statut: 'accepte', date: '2026-01-01' },  // pas en attente
      ],
    }, TODAY)
    expect(a.find(x => x.id === 'devis-en-attente')).toBeUndefined()
  })
  it('cas actif → info', () => {
    const a = buildAlertes({
      devisEnAttente: [
        { id: 'q1', statut: 'envoye', date: '2026-07-01' },     // 20 j
        { id: 'q2', statut: 'brouillon', date: '2026-06-20' },  // 31 j
      ],
    }, TODAY)
    const al = a.find(x => x.id === 'devis-en-attente')!
    expect(al.severite).toBe('info')
    expect(al.count).toBe(2)
  })
})

describe('véhicules ct/assurance/révision', () => {
  it('cas 0', () => {
    const a = buildAlertes({
      vehicules: [{ id: 'v1', label: 'AA-1', ct_expiry: '2026-12-01', insurance_expiry: '2026-12-01', next_revision_date: '2026-12-01' }],
    }, TODAY)
    expect(a.some(x => x.domaine === 'vehicule')).toBe(false)
  })
  it('dépassé → rouge, bientôt (<30j) → orange', () => {
    const a = buildAlertes({
      vehicules: [
        { id: 'v1', label: 'AA-1', ct_expiry: '2026-07-01', insurance_expiry: null, next_revision_date: null }, // dépassé
        { id: 'v2', label: 'BB-2', ct_expiry: '2026-08-10', insurance_expiry: null, next_revision_date: null }, // 20 j → orange
      ],
    }, TODAY)
    expect(a.find(x => x.id === 'vehicules-depasse')?.severite).toBe('rouge')
    expect(a.find(x => x.id === 'vehicules-depasse')?.count).toBe(1)
    expect(a.find(x => x.id === 'vehicules-bientot')?.severite).toBe('orange')
    expect(a.find(x => x.id === 'vehicules-bientot')?.count).toBe(1)
  })
})

describe('notes de frais non remboursées', () => {
  it('cas 0', () => {
    const a = buildAlertes({
      notesDeFrais: [{ id: 'c1', mode_paiement: 'note_de_frais', rembourse_le: '2026-07-01', montant_ttc_cts: 5000 }],
    }, TODAY)
    expect(a.find(x => x.id === 'notes-frais')).toBeUndefined()
  })
  it('cas actif → info + montant', () => {
    const a = buildAlertes({
      notesDeFrais: [
        { id: 'c1', mode_paiement: 'note_de_frais', rembourse_le: null, montant_ttc_cts: 5000 },
        { id: 'c2', mode_paiement: 'note_de_frais', rembourse_le: null, montant_ttc_cts: 3000 },
        { id: 'c3', mode_paiement: 'qonto', rembourse_le: null, montant_ttc_cts: 9999 }, // pas une note de frais
      ],
    }, TODAY)
    const al = a.find(x => x.id === 'notes-frais')!
    expect(al.severite).toBe('info')
    expect(al.count).toBe(2)
    expect(al.montantCts).toBe(8000)
  })
})

describe('rapprochement (aRapprocher) intégré', () => {
  it('mappe les compteurs en alertes typées', () => {
    const a = buildAlertes({
      aRapprocher: { ...emptyRapprocher, tresorerie: 2, encaissements: 1, categorisation: 3, pennylane_supprimees: 1, total: 7 },
    }, TODAY)
    expect(a.find(x => x.id === 'tresorerie')?.severite).toBe('orange')
    expect(a.find(x => x.id === 'encaissements')?.severite).toBe('orange')
    expect(a.find(x => x.id === 'categorisation')?.severite).toBe('info')
    expect(a.find(x => x.id === 'pennylane-supprimees')?.severite).toBe('rouge')
  })
})

describe('tri + résumé', () => {
  it('rouge avant orange avant info', () => {
    const a = buildAlertes({
      aRapprocher: { ...emptyRapprocher, categorisation: 1, tresorerie: 1, pennylane_supprimees: 1, total: 3 },
    }, TODAY)
    expect(a.map(x => x.severite)).toEqual(['rouge', 'orange', 'info'])
  })

  it('badge = rouge + orange (info exclu)', () => {
    const a = buildAlertes({
      aRapprocher: { ...emptyRapprocher, categorisation: 5, tresorerie: 1, pennylane_supprimees: 1, total: 7 },
    }, TODAY)
    const r = resumeAlertes(a)
    expect(r.rouge).toBe(1)
    expect(r.orange).toBe(1)
    expect(r.info).toBe(1)
    expect(r.badge).toBe(2)   // les 5 charges à catégoriser (info) ne comptent pas
  })

  it('état vide → badge 0', () => {
    expect(resumeAlertes(buildAlertes({}, TODAY))).toEqual({ rouge: 0, orange: 0, info: 0, badge: 0 })
  })
})
