import { describe, it, expect } from 'vitest'
import { montantSaisiEnCts, manquesDepense, totalARembourser, libelleCategorie } from './depenses'

describe('dépenses', () => {
  it('montant saisi', () => {
    expect(montantSaisiEnCts('12,50')).toBe(1250)
    expect(montantSaisiEnCts(' 8 ')).toBe(800)
    expect(montantSaisiEnCts('')).toBeNull()
    expect(montantSaisiEnCts('12,555')).toBeNaN()
    expect(montantSaisiEnCts('abc')).toBeNaN()
  })
  it('manques', () => {
    expect(manquesDepense({ montant: '', categorie: '', moyen: '', date: '', aUnFichier: false }))
      .toEqual(['Photo du justificatif', 'Payé avec quoi ?', 'Catégorie', 'Date de la dépense'])
    expect(manquesDepense({ montant: '', categorie: 'repas', moyen: 'personnel', date: '2026-10-12', aUnFichier: true }))
      .toEqual(['Montant (note de frais)'])
    expect(manquesDepense({ montant: '', categorie: 'peage', moyen: 'carte_societe', date: '2026-10-12', aUnFichier: true })).toEqual([])
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
})
