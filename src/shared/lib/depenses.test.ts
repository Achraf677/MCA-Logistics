import { describe, it, expect } from 'vitest'
import { montantSaisiEnCts, manquesDepense, totalARembourser, libelleCategorie, manquesValidation } from './depenses'

describe('dépenses', () => {
  it('montant saisi', () => {
    expect(montantSaisiEnCts('12,50')).toBe(1250)
    expect(montantSaisiEnCts(' 8 ')).toBe(800)
    expect(montantSaisiEnCts('')).toBeNull()
    expect(montantSaisiEnCts('12,555')).toBeNaN()
    expect(montantSaisiEnCts('abc')).toBeNaN()
  })
  it('manques', () => {
    expect(manquesDepense({ montant: '', categorie: '', moyen: '', date: '', note: '', aUnFichier: false }))
      .toEqual(['Photo du justificatif', 'Payé avec quoi ?', 'Note', 'Date de la dépense'])
    expect(manquesDepense({ montant: '', categorie: '', moyen: 'personnel', date: '2026-10-12', note: 'Plein', aUnFichier: true }))
      .toEqual(['Montant (note de frais)'])
    // La catégorie n'est plus demandée au salarié ; la note l'est.
    expect(manquesDepense({ montant: '', categorie: '', moyen: 'carte_societe', date: '2026-10-12', note: 'Péage A35', aUnFichier: true })).toEqual([])
    expect(manquesDepense({ montant: '', categorie: '', moyen: 'carte_societe', date: '2026-10-12', note: '   ', aUnFichier: true })).toEqual(['Note'])
  })
  it('total à rembourser', () => {
    expect(totalARembourser([
      { moyen_paiement: 'personnel', montant_ttc_cts: 1250, statut: 'a_traiter' },
      { moyen_paiement: 'personnel', montant_ttc_cts: 500, statut: 'ignore' },
      { moyen_paiement: 'carte_societe', montant_ttc_cts: 9000, statut: 'traite' },
    ])).toBe(1250)
  })
  it('libellé de catégorie', () => {
    expect(libelleCategorie('peage')).toBe('Péage')
    expect(libelleCategorie(null)).toBe('Non précisée')
  })
  it('une note de frais déjà remboursée n’est plus due', () => {
    expect(totalARembourser([
      { moyen_paiement: 'personnel', montant_ttc_cts: 1250, statut: 'traite', rembourse_le: '2026-10-20' },
      { moyen_paiement: 'personnel', montant_ttc_cts: 800, statut: 'traite', rembourse_le: null },
    ])).toBe(800)
  })
  it('validation : tout est obligatoire', () => {
    const complet = { montant_ttc_cts: 1250, date_depense: '2026-10-21', categorie: 'repas', moyen_paiement: 'personnel', supplier_id: 's1' }
    expect(manquesValidation(complet)).toEqual([])
    expect(manquesValidation({ ...complet, montant_ttc_cts: 0 })).toEqual(['Montant'])
    expect(manquesValidation({})).toEqual(['Montant', 'Date', 'Catégorie', 'Moyen de paiement', 'Fournisseur'])
    expect(manquesValidation({ ...complet, supplier_id: null })).toEqual(['Fournisseur'])
  })
})
