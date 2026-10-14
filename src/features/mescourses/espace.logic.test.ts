import { describe, it, expect } from 'vitest'
import {
  lireOnglet, joursEntre, etatEcheance,
  montantPourSaisie, formulaireDepenseDepuis, manquesDepenseSalarie, detailsDepense, estImage,
} from './espace.logic'

describe('onglets', () => {
  it('lit un onglet connu, sinon courses', () => {
    expect(lireOnglet('journee')).toBe('courses')
    expect(lireOnglet('depenses')).toBe('depenses')
    expect(lireOnglet('moi')).toBe('moi')
    expect(lireOnglet(null)).toBe('courses')
    expect(lireOnglet('ticket')).toBe('courses')
  })
})

describe('dates', () => {
  it('jours entre deux dates', () => {
    expect(joursEntre('2026-10-12', '2026-10-15')).toBe(3)
    expect(joursEntre('2026-10-12', '2026-10-10')).toBe(-2)
  })
})

describe('etatEcheance', () => {
  const auj = '2026-10-12'
  it('absente', () => expect(etatEcheance(null, auj).niveau).toBe('absente'))
  it('dépassée', () => {
    const e = etatEcheance('2026-10-10', auj)
    expect(e.niveau).toBe('depassee'); expect(e.libelle).toBe('Dépassée depuis 2 jours')
  })
  it('bientôt (< 30 j) et le jour même', () => {
    expect(etatEcheance('2026-11-01', auj).niveau).toBe('bientot')
    expect(etatEcheance(auj, auj).libelle).toBe("Expire aujourd'hui")
  })
  it('à jour à 30 j et plus', () => expect(etatEcheance('2026-11-11', auj).niveau).toBe('ok'))
})

describe('dépenses', () => {
  it('montant pour saisie', () => {
    expect(montantPourSaisie(1250)).toBe('12,50')
    expect(montantPourSaisie(null)).toBe('')
  })
  it('formulaire depuis une dépense', () => {
    expect(formulaireDepenseDepuis({ montant_ttc_cts: 500, categorie: 'peage', moyen_paiement: 'personnel', date_depense: null, note: 'A35', created_at: '2026-10-11T08:00:00Z' }, '2026-10-12'))
      .toEqual({ montant: '5,00', categorie: 'peage', moyen: 'personnel', date: '2026-10-11', note: 'A35' })
  })
  it('manques : date future refusée', () => {
    const f = { montant: '12', categorie: 'repas' as const, moyen: 'carte_societe' as const, date: '2026-10-13', note: '' }
    expect(manquesDepenseSalarie(f, true, '2026-10-12')).toEqual(['La date ne peut pas être dans le futur'])
    expect(manquesDepenseSalarie({ ...f, date: '2026-10-12' }, false, '2026-10-12')).toEqual(['Photo du justificatif'])
  })
  it('détails à écrire', () => {
    expect(detailsDepense({ montant: '12,5', categorie: 'repas', moyen: 'personnel', date: '2026-10-12', note: '' }))
      .toEqual({ montant_ttc_cts: 1250, categorie: 'repas', moyen_paiement: 'personnel', date_depense: '2026-10-12' })
    expect(detailsDepense({ montant: '', categorie: '', moyen: '', date: '', note: '' }).montant_ttc_cts).toBeNull()
  })
  it('estImage', () => {
    expect(estImage('image/jpeg')).toBe(true)
    expect(estImage('application/pdf')).toBe(false)
    expect(estImage(null)).toBe(false)
  })
})
