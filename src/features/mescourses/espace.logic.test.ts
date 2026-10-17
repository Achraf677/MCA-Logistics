import { describe, it, expect } from 'vitest'
import {
  lireOnglet, decalerJour, borneAujourdhui, decalerMois, libelleMois, joursEntre, etatEcheance,
  formulaireDepuis, lireFormulaire, pas, formulaireModifie, lignesCorrection, joursDuMois,
  colisEnAttente, estimationPaie, montantPourSaisie, formulaireDepenseDepuis, manquesDepenseSalarie,
  detailsDepense, estImage, FORMULAIRE_VIDE,
} from './espace.logic'
import { totauxJournees, type JourneeColis } from '../../shared/lib/journeesColis'

function j(p: Partial<JourneeColis>): JourneeColis {
  return {
    id: 'j', company_id: 'c', member_id: 'm', date: '2026-10-12', client_id: 'k',
    colis_domicile: 0, colis_relais: 0, colis_litige: 0, litige_raison: null, note: null,
    statut: 'brouillon', domicile_valide: null, relais_valide: null, litige_valide: null,
    motif_refus: null, motif_modification: null, envoyee_le: null, valide_par: null, valide_le: null,
    created_at: '', updated_at: '', ...p,
  }
}

describe('onglets', () => {
  it('lit un onglet connu, sinon courses', () => {
    expect(lireOnglet('journee')).toBe('journee')
    expect(lireOnglet('moi')).toBe('moi')
    expect(lireOnglet('tournee')).toBe('tournee')
    expect(lireOnglet(null)).toBe('courses')
    expect(lireOnglet('ticket')).toBe('courses')
  })
})

describe('dates', () => {
  it('décale les jours en passant les mois et années', () => {
    expect(decalerJour('2026-10-31', 1)).toBe('2026-11-01')
    expect(decalerJour('2026-01-01', -1)).toBe('2025-12-31')
    expect(decalerJour('2026-03-29', 1)).toBe('2026-03-30') // changement d'heure : sans effet
  })
  it('jamais après aujourd’hui', () => {
    expect(borneAujourdhui('2026-10-13', '2026-10-12')).toBe('2026-10-12')
    expect(borneAujourdhui('2026-10-11', '2026-10-12')).toBe('2026-10-11')
  })
  it('mois', () => {
    expect(decalerMois('2026-01', -1)).toBe('2025-12')
    expect(decalerMois('2026-12', 1)).toBe('2027-01')
    expect(libelleMois('2026-10')).toBe('octobre 2026')
  })
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

describe('formulaire de journée', () => {
  it('pré-remplit depuis la journée (0 = vide)', () => {
    expect(formulaireDepuis(j({ colis_domicile: 12, litige_raison: 'abîmé' })))
      .toEqual({ domicile: '12', relais: '', litige: '', raison: 'abîmé', note: '' })
    expect(formulaireDepuis(null)).toEqual(FORMULAIRE_VIDE)
  })
  it('lit les nombres et signale les invalides', () => {
    const r = lireFormulaire({ domicile: '10', relais: '', litige: '2,5', raison: '', note: '' })
    expect(r.saisie.colis_domicile).toBe(10)
    expect(r.saisie.colis_relais).toBe(0)
    expect(r.invalides).toEqual(['Colis en litige : nombre invalide'])
  })
  it('− / + borné à 0', () => {
    expect(pas('', 1)).toBe('1')
    expect(pas('1', -1)).toBe('')
    expect(pas('', -1)).toBe('')
    expect(pas('abc', 1)).toBe('1')
  })
  it('détecte une modification', () => {
    const jj = j({ colis_domicile: 3 })
    expect(formulaireModifie(formulaireDepuis(jj), jj)).toBe(false)
    expect(formulaireModifie({ ...formulaireDepuis(jj), relais: '1' }, jj)).toBe(true)
    expect(formulaireModifie(FORMULAIRE_VIDE, null)).toBe(false)
  })
})

describe('correction du bureau', () => {
  it('liste les écarts d’une journée validée', () => {
    expect(lignesCorrection(j({ statut: 'validee', colis_domicile: 120, domicile_valide: 118, colis_relais: 5, relais_valide: 5 })))
      .toEqual(['À domicile : 120 → 118'])
    expect(lignesCorrection(j({ statut: 'envoyee', colis_domicile: 120, domicile_valide: 118 }))).toEqual([])
  })
})

describe('mon mois', () => {
  const liste = [
    j({ id: 'a', date: '2026-10-01', statut: 'validee', colis_domicile: 10, domicile_valide: 9, colis_relais: 2, relais_valide: 2 }),
    j({ id: 'b', date: '2026-10-01', client_id: 'k2', statut: 'envoyee', colis_domicile: 5 }),
    j({ id: 'c', date: '2026-10-03', statut: 'brouillon', colis_domicile: 7 }),
  ]
  it('regroupe par jour, plus récent d’abord', () => {
    const jours = joursDuMois(liste)
    expect(jours.map(x => x.date)).toEqual(['2026-10-03', '2026-10-01'])
    expect(jours[1].domicile).toBe(14)
  })
  it('en attente = déclaré non validé', () => {
    const t = totauxJournees(liste)
    expect(colisEnAttente(t)).toEqual({ domicile: 5, relais: 0, litige: 0 })
  })
  it('estimation sur le validé, null si tarif manquant', () => {
    const t = totauxJournees(liste)
    expect(estimationPaie(t, { tarif_domicile_cts: 150, tarif_relais_cts: 100 })).toEqual({ cts: 9 * 150 + 2 * 100, rien: false })
    expect(estimationPaie(t, { tarif_domicile_cts: 150, tarif_relais_cts: null }).cts).toBeNull()
    expect(estimationPaie(totauxJournees([]), { tarif_domicile_cts: null, tarif_relais_cts: null })).toEqual({ cts: 0, rien: true })
  })
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
