import { describe, it, expect } from 'vitest'
import {
  isoLocal, mois, moisDeLaPeriode, agregerParMois, evolution, eurosArrondis, eurosCourts,
  resumeJour, echeance, aEncaisser, resteAFacturer,
} from './dashboard.logic'

describe('dates locales', () => {
  it('le mois d’octobre va du 1er au 31 (plus de décalage UTC)', () => {
    const m = mois(new Date(2026, 9, 15))
    expect(m).toMatchObject({ cle: '2026-10', debut: '2026-10-01', fin: '2026-10-31' })
  })
  it('février bissextile, décalage d’année', () => {
    expect(mois(new Date(2028, 1, 10)).fin).toBe('2028-02-29')
    expect(mois(new Date(2026, 0, 5), -1).cle).toBe('2025-12')
  })
  it('isoLocal utilise les composantes locales', () => {
    expect(isoLocal(new Date(2026, 8, 1, 0, 30))).toBe('2026-09-01')
  })
  it('périodes', () => {
    const ref = new Date(2026, 8, 30)
    expect(moisDeLaPeriode('6m', ref).map(m => m.cle)).toEqual(
      ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(moisDeLaPeriode('12m', ref)).toHaveLength(12)
    expect(moisDeLaPeriode('ytd', ref)[0].cle).toBe('2026-01')
    expect(moisDeLaPeriode('ytd', ref)).toHaveLength(9)
  })
})

describe('agregerParMois', () => {
  it('additionne par mois, ignore annulées et hors période', () => {
    const liste = moisDeLaPeriode('6m', new Date(2026, 8, 30)).slice(-2) // août, sept
    const pts = agregerParMois(liste, [
      { date: '2026-08-31', statut: 'livree', amount_ht_cts: 1000 },
      { date: '2026-09-01', statut: 'facturee', amount_ht_cts: 2000 },
      { date: '2026-09-02', statut: 'annulee', amount_ht_cts: 9999 },
      { date: '2026-03-01', statut: 'payee', amount_ht_cts: 5000 },
    ])
    expect(pts[0]).toMatchObject({ cle: '2026-08', caHtCts: 1000, nb: 1, nbFacturee: 0 })
    expect(pts[1]).toMatchObject({ cle: '2026-09', caHtCts: 2000, nb: 1, nbFacturee: 1 })
  })
})

describe('evolution', () => {
  it('pourcentage et sens', () => {
    expect(evolution(1000, 1500)).toEqual({ value: '50,0 %', dir: 'up' })
    expect(evolution(1000, 500)?.dir).toBe('down')
    expect(evolution(0, 500)).toBeNull()
  })
})

describe('resumeJour', () => {
  const auj = '2026-09-30'
  it('compte la journée, les retards et les échecs', () => {
    const r = resumeJour([
      { date: auj, statut: 'planifiee', arrival_time: '09:00:00', probleme_le: null },   // à faire + retard
      { date: auj, statut: 'planifiee', arrival_time: '18:00:00', probleme_le: null },   // à faire
      { date: auj, statut: 'en_cours', arrival_time: null, probleme_le: 'x' },           // en cours + échec
      { date: auj, statut: 'livree', arrival_time: '08:00', probleme_le: null },         // livrée
      { date: auj, statut: 'annulee', arrival_time: null, probleme_le: null },           // rien
      { date: '2026-09-29', statut: 'planifiee', arrival_time: null, probleme_le: null }, // retard (veille)
    ], auj, 10 * 60)
    expect(r).toEqual({ aFaire: 2, enCours: 1, livrees: 1, enRetard: 2, echecs: 1 })
  })
})

describe('argent', () => {
  it('échéance = facture + délai', () => {
    expect(echeance('2026-09-01', 30)).toBe('2026-10-01')
    expect(echeance('2026-09-01T10:00:00+00:00', 0)).toBe('2026-09-01')
  })
  it('à encaisser et en retard', () => {
    const r = aEncaisser([
      { invoiced_at: '2026-08-01', payment_terms: 30, amount_ttc_cts: 1200 }, // échue le 31/08
      { invoiced_at: '2026-09-20', payment_terms: 30, amount_ttc_cts: 600 },
      { invoiced_at: null, payment_terms: 30, amount_ttc_cts: 100 },
    ], '2026-09-30')
    expect(r).toEqual({ totalCts: 1900, retardCts: 1200, nbRetard: 1, nb: 3 })
  })
  it('reste à facturer', () => {
    expect(resteAFacturer([{ amount_ht_cts: 100 }, { amount_ht_cts: 250 }])).toEqual({ totalCts: 350, nb: 2 })
  })
})

describe('formats courts', () => {
  const nbsp = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ')
  it('euros arrondis', () => {
    expect(nbsp(eurosArrondis(189459))).toBe('1 895 €')
  })
  it('k€', () => {
    expect(eurosCourts(189459)).toBe('1,9 k€')
    expect(eurosCourts(85000)).toBe('850 €')
    expect(eurosCourts(400000)).toBe('4 k€')
  })
})
