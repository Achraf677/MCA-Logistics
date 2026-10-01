import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS, canTransition, allowedNextStatuses,
  computeAmount, effectiveHtCts, effectiveTtcCts, formatCents, kpiSummary,
  extraLinesHtCts, extraLinesTvaCts, extraLinesTtcCts,
  deliveryTotalHtCts, deliveryTotalTtcCts, libelleDelaiPaiement,
  isoLocal, bornesPeriode, dansPeriode, libellePeriode, echeanceFacture, eurosArrondis,
  dateCourte, heureCourte, villeDe, trajet, nettoyerRecherche, messageDepuisCorps,
  STATUS_COLORS, manquesFiche, libelleCreneau, libelleDuree, heureSaisie, creneauInvalide,
  blocsPrestation } from './livraisons.logic'
import type { ClientTariff, FicheASaisir } from './livraisons.logic'
import type { DeliveryExtraLine, DeliveryRow, DeliveryStatus } from './livraisons.types'

// Helper : construit un DeliveryRow minimal (seuls les champs lus par la logique comptent).
function row(p: Partial<DeliveryRow>): DeliveryRow {
  return p as unknown as DeliveryRow
}

// Normalise les espaces (l'Intl fr-FR insère des espaces insécables variables selon l'ICU).
const norm = (s: string) => s.replace(/\s/g, ' ')

// ── a. Machine à états ─────────────────────────────────────────────────────────
describe('canTransition / allowedNextStatuses', () => {
  it('autorise toutes les transitions déclarées dans TRANSITIONS', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        expect(canTransition(from, to)).toBe(true)
      }
    }
  })

  const invalides: Array<[string, string]> = [
    ['planifiee', 'facturee'],
    ['planifiee', 'payee'],
    ['livree', 'payee'],
    ['en_cours', 'planifiee'],
    ['payee', 'facturee'],
    ['payee', 'en_cours'],
    ['annulee', 'en_cours'],
  ]
  it.each(invalides)('refuse la transition invalide %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })

  it('refuse un statut inconnu', () => {
    expect(canTransition('inconnu', 'en_cours')).toBe(false)
    expect(allowedNextStatuses('inconnu')).toEqual([])
  })

  it('allowedNextStatuses renvoie les cibles déclarées (états terminaux = [])', () => {
    expect(allowedNextStatuses('planifiee')).toEqual(['en_cours', 'livree', 'annulee'])
    expect(allowedNextStatuses('en_cours')).toEqual(['livree', 'annulee'])
    expect(allowedNextStatuses('livree')).toEqual(['facturee'])
    expect(allowedNextStatuses('facturee')).toEqual(['payee'])
    expect(allowedNextStatuses('payee')).toEqual([])
    expect(allowedNextStatuses('annulee')).toEqual([])
  })
})

// ── b. Calcul du montant ─────────────────────────────────────────────────────────
describe('computeAmount', () => {
  it('forfait → amount_ht_cts = tariff_rate_cts', () => {
    const c: ClientTariff = { tariff_mode: 'forfait', tariff_rate_cts: 15000 }
    expect(computeAmount(c, {})!.amount_ht_cts).toBe(15000)
  })

  it('km → amount_ht_cts = rate × distance', () => {
    const c: ClientTariff = { tariff_mode: 'km', tariff_rate_cts: 100 }
    expect(computeAmount(c, { distance_km: 25 })!.amount_ht_cts).toBe(2500)
  })

  it('palette → amount_ht_cts = rate × pallets', () => {
    const c: ClientTariff = { tariff_mode: 'palette', tariff_rate_cts: 500 }
    expect(computeAmount(c, { pallets: 3 })!.amount_ht_cts).toBe(1500)
  })

  it('manuel → amount_ht_cts = manual_ht_cts', () => {
    const c: ClientTariff = { tariff_mode: 'manuel', tariff_rate_cts: null }
    expect(computeAmount(c, { manual_ht_cts: 12345 })!.amount_ht_cts).toBe(12345)
  })

  it('TVA auto (20 %) → ttc = round(ht×1,2), tva = ttc − ht, invariant ht+tva=ttc', () => {
    const c: ClientTariff = { tariff_mode: 'forfait', tariff_rate_cts: 15000 }
    const r = computeAmount(c, {})!
    expect(r.amount_ttc_cts).toBe(18000)
    expect(r.tva_cts).toBe(3000)
    expect(r.amount_ht_cts + r.tva_cts).toBe(r.amount_ttc_cts)
  })

  it('TVA auto avec arrondi → tva calculée par différence (pas ht×rate brut)', () => {
    // ht = 999 → ttc = round(999×1,2) = round(1198,8) = 1199 → tva = 1199 − 999 = 200
    const c: ClientTariff = { tariff_mode: 'forfait', tariff_rate_cts: 999 }
    const r = computeAmount(c, {})!
    expect(r.amount_ttc_cts).toBe(1199)
    expect(r.tva_cts).toBe(200)
    expect(r.amount_ht_cts + r.tva_cts).toBe(r.amount_ttc_cts)
  })

  it('TVA manuelle → tva_cts = manual_tva_cts, ttc = ht + tva', () => {
    const c: ClientTariff = { tariff_mode: 'manuel', tariff_rate_cts: null }
    const r = computeAmount(c, { manual_ht_cts: 5000, manual_tva_cts: 1000 })!
    expect(r.tva_cts).toBe(1000)
    expect(r.amount_ttc_cts).toBe(6000)
    expect(r.amount_ht_cts + r.tva_cts).toBe(r.amount_ttc_cts)
  })

  it('arrondi du HT : rate × distance non entier → Math.round', () => {
    // 333 × 1,5 = 499,5 → 500
    const c: ClientTariff = { tariff_mode: 'km', tariff_rate_cts: 333 }
    expect(computeAmount(c, { distance_km: 1.5 })!.amount_ht_cts).toBe(500)
  })

  it('paramètres insuffisants → null', () => {
    expect(computeAmount({ tariff_mode: 'km', tariff_rate_cts: null }, { distance_km: 10 })).toBeNull()
    expect(computeAmount({ tariff_mode: 'km', tariff_rate_cts: 100 }, {})).toBeNull()
    expect(computeAmount({ tariff_mode: 'manuel', tariff_rate_cts: null }, {})).toBeNull()
  })
})

// ── c. Montants effectifs (v2 vs legacy) ─────────────────────────────────────────
describe('effectiveHtCts / effectiveTtcCts', () => {
  it('amount_* présent → renvoyé (priorité v2)', () => {
    expect(effectiveHtCts(row({ amount_ht_cts: 5000, montant_ht_cts: 999 }))).toBe(5000)
    expect(effectiveTtcCts(row({ amount_ttc_cts: 6000, montant_ttc_cts: 111 }))).toBe(6000)
  })

  it('amount_* null + montant_* présent → fallback legacy', () => {
    expect(effectiveHtCts(row({ amount_ht_cts: null, montant_ht_cts: 777 }))).toBe(777)
    expect(effectiveTtcCts(row({ amount_ttc_cts: null, montant_ttc_cts: 888 }))).toBe(888)
  })

  it('les deux absents → 0', () => {
    expect(effectiveHtCts(row({ amount_ht_cts: null, montant_ht_cts: null as unknown as number }))).toBe(0)
    expect(effectiveTtcCts(row({ amount_ttc_cts: null, montant_ttc_cts: null }))).toBe(0)
  })
})

// ── d. KPIs ──────────────────────────────────────────────────────────────────────
describe('période (dates locales)', () => {
  it('isoLocal ne passe pas par UTC (minuit heure locale = même jour)', () => {
    expect(isoLocal(new Date(2026, 9, 1, 0, 0, 0))).toBe('2026-10-01')
    expect(isoLocal(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30')
  })

  it('mois : du 1er au dernier jour, y compris le 1er à minuit', () => {
    expect(bornesPeriode('mois', new Date(2026, 9, 1, 0, 5))).toEqual({ debut: '2026-10-01', fin: '2026-10-31' })
    expect(bornesPeriode('mois', new Date(2026, 1, 14))).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesPeriode('mois', new Date(2028, 1, 29))).toEqual({ debut: '2028-02-01', fin: '2028-02-29' })
    expect(bornesPeriode('mois', new Date(2026, 11, 31, 23, 59))).toEqual({ debut: '2026-12-01', fin: '2026-12-31' })
  })

  it('semaine : lundi → dimanche, à cheval sur deux mois', () => {
    // mercredi 30/09/2026
    expect(bornesPeriode('semaine', new Date(2026, 8, 30))).toEqual({ debut: '2026-09-28', fin: '2026-10-04' })
    // dimanche 04/10/2026 : reste dans la même semaine
    expect(bornesPeriode('semaine', new Date(2026, 9, 4))).toEqual({ debut: '2026-09-28', fin: '2026-10-04' })
    // lundi 05/10/2026
    expect(bornesPeriode('semaine', new Date(2026, 9, 5))).toEqual({ debut: '2026-10-05', fin: '2026-10-11' })
  })

  it("jour et tout", () => {
    expect(bornesPeriode('jour', new Date(2026, 8, 30, 0, 1))).toEqual({ debut: '2026-09-30', fin: '2026-09-30' })
    expect(bornesPeriode('tout', new Date())).toEqual({})
  })

  it('dansPeriode : bornes incluses, absentes = ouvertes', () => {
    const p = { debut: '2026-09-01', fin: '2026-09-30' }
    expect(dansPeriode('2026-09-01', p)).toBe(true)
    expect(dansPeriode('2026-09-30', p)).toBe(true)
    expect(dansPeriode('2026-08-31', p)).toBe(false)
    expect(dansPeriode('2026-10-01', p)).toBe(false)
    expect(dansPeriode('1999-01-01', {})).toBe(true)
    expect(dansPeriode('2026-10-01', { debut: '2026-09-01' })).toBe(true)
  })

  it('libellePeriode', () => {
    expect(libellePeriode({ debut: '2026-09-01', fin: '2026-09-30' })).toBe('01/09 → 30/09/2026')
    expect(libellePeriode({ debut: '2025-12-29', fin: '2026-01-04' })).toBe('29/12/2025 → 04/01/2026')
    expect(libellePeriode({ debut: '2026-09-30', fin: '2026-09-30' })).toBe('30/09/2026')
    expect(libellePeriode({})).toBe("Tout l'historique")
    expect(libellePeriode({ debut: '2026-09-01' })).toBe('Depuis le 01/09/2026')
  })
})

describe('kpiSummary (période affichée)', () => {
  const sept = { debut: '2026-09-01', fin: '2026-09-30' }

  it('agrège la période : courses, CA HT, à facturer, à encaisser (hors annulées)', () => {
    const rows: DeliveryRow[] = [
      row({ statut: 'facturee', date: '2026-09-01', amount_ht_cts: 10000, amount_ttc_cts: 12000, invoiced_at: '2026-09-25', clients: { payment_terms: 30 } as DeliveryRow['clients'] }),
      row({ statut: 'payee',    date: '2026-09-30', amount_ht_cts:  4200, amount_ttc_cts:  5040 }),
      row({ statut: 'livree',   date: '2026-09-15', amount_ht_cts:  3000, amount_ttc_cts:  3600 }),
      row({ statut: 'planifiee', date: '2026-09-20', amount_ht_cts: 1000, amount_ttc_cts:  1200 }),
      row({ statut: 'en_cours', date: '2026-09-21', amount_ht_cts:  500, amount_ttc_cts:   600 }),
      row({ statut: 'annulee',  date: '2026-09-10', amount_ht_cts: 99999, amount_ttc_cts: 99999 }),
    ]
    const k = kpiSummary(rows, sept, '2026-09-30')
    expect(k.nbCourses).toBe(5)
    expect(k.nbAFaire).toBe(2)
    expect(k.nbFaites).toBe(3)
    expect(k.caHtCts).toBe(18700)
    expect(k.aFacturerHtCts).toBe(3000)
    expect(k.nbAFacturer).toBe(1)
    expect(k.aEncaisserTtcCts).toBe(12000)
    expect(k.nbAEncaisser).toBe(1)
    expect(k.nbRetard).toBe(0)
  })

  it('bug corrigé : ni la veille du 1er, ni le mois suivant ne comptent', () => {
    const rows: DeliveryRow[] = [
      row({ statut: 'planifiee', date: '2026-08-31', amount_ht_cts: 100 }),
      row({ statut: 'planifiee', date: '2026-09-01', amount_ht_cts: 100 }),
      row({ statut: 'planifiee', date: '2026-09-30', amount_ht_cts: 100 }),
      row({ statut: 'planifiee', date: '2026-10-01', amount_ht_cts: 100 }),
      row({ statut: 'planifiee', date: '2027-01-15', amount_ht_cts: 100 }),
    ]
    const k = kpiSummary(rows, bornesPeriode('mois', new Date(2026, 8, 1, 0, 30)), '2026-09-01')
    expect(k.nbCourses).toBe(2)
    expect(k.caHtCts).toBe(200)
  })

  it('lignes supplémentaires comprises dans le CA et les montants', () => {
    const rows: DeliveryRow[] = [
      row({ statut: 'livree', date: '2026-09-02', amount_ht_cts: 10000, amount_ttc_cts: 12000,
        extra_lines: [{ label: 'Attente', quantity: 2, amount_ht_cts: 1500, tva_rate: 20 }] }),
    ]
    const k = kpiSummary(rows, sept, '2026-09-30')
    expect(k.caHtCts).toBe(13000)
    expect(k.aFacturerHtCts).toBe(13000)
  })

  it('retard : échéance = facture + délai client (30 j par défaut), dépassée strictement', () => {
    const f = (invoiced_at: string, payment_terms?: number | null) => row({
      statut: 'facturee', date: '2026-09-01', amount_ht_cts: 1000, amount_ttc_cts: 1200, invoiced_at,
      clients: (payment_terms === undefined ? null : { payment_terms }) as DeliveryRow['clients'],
    })
    const k = kpiSummary([
      f('2026-08-01'),        // échéance 31/08 → en retard
      f('2026-08-31'),        // échéance 30/09 → pas encore
      f('2026-09-10', 10),    // échéance 20/09 → en retard
      f('2026-09-10', null),  // délai absent → 30 j → 10/10
    ], sept, '2026-09-30')
    expect(k.nbAEncaisser).toBe(4)
    expect(k.aEncaisserTtcCts).toBe(4800)
    expect(k.nbRetard).toBe(2)
    expect(k.retardTtcCts).toBe(2400)
  })

  it('tableau vide → zéros', () => {
    expect(kpiSummary([], {}, '2026-09-30')).toEqual({
      nbCourses: 0, nbAFaire: 0, nbFaites: 0, caHtCts: 0, aFacturerHtCts: 0, nbAFacturer: 0,
      aEncaisserTtcCts: 0, nbAEncaisser: 0, retardTtcCts: 0, nbRetard: 0,
    })
  })

  it('echeanceFacture : passage de mois en date locale', () => {
    expect(echeanceFacture('2026-01-31T10:00:00Z', 30)).toBe('2026-03-02')
    expect(echeanceFacture('2026-09-30', 0)).toBe('2026-09-30')
  })
})

describe('affichage d\'une ligne', () => {
  it('eurosArrondis', () => {
    expect(norm(eurosArrondis(123456))).toBe('1 235 €')
    expect(norm(eurosArrondis(0))).toBe('0 €')
  })

  it('dateCourte : année courante sans année', () => {
    expect(dateCourte('2026-09-30', 2026)).toBe('30/09')
    expect(dateCourte('2025-12-31', 2026)).toBe('31/12/25')
  })

  it('heureCourte', () => {
    expect(heureCourte('14:30:00')).toBe('14:30')
    expect(heureCourte('9:05')).toBe('09:05')
    expect(heureCourte(null)).toBeNull()
    expect(heureCourte('')).toBeNull()
    expect(heureCourte('bientôt')).toBeNull()
  })

  it('villeDe : ville après le code postal, sinon dernier morceau', () => {
    expect(villeDe('12 rue du Port, 67540 Ostwald')).toBe('Ostwald')
    expect(villeDe('3 avenue de la Liberté, 68000 Colmar, France')).toBe('Colmar')
    expect(villeDe('Zone industrielle, Molsheim')).toBe('Molsheim')
    expect(villeDe('Dépôt Nord')).toBe('Dépôt Nord')
    expect(villeDe(null)).toBe('')
  })

  it('trajet : court (villes) et complet ; sans enlèvement = Dépôt', () => {
    expect(trajet('1 rue A, 67000 Strasbourg', '2 rue B, 68100 Mulhouse')).toEqual({
      court: 'Strasbourg → Mulhouse',
      complet: '1 rue A, 67000 Strasbourg → 2 rue B, 68100 Mulhouse',
    })
    expect(trajet(null, '2 rue B, 68100 Mulhouse').court).toBe('Dépôt → Mulhouse')
    expect(trajet('', null).court).toBe('Dépôt → —')
  })

  it('livrée et facturée ont des couleurs distinctes', () => {
    expect(STATUS_COLORS.livree).not.toBe(STATUS_COLORS.facturee)
  })
})

describe('recherche & erreurs Edge', () => {
  it('nettoyerRecherche retire les caractères spéciaux de PostgREST', () => {
    expect(nettoyerRecherche('  Dupont, (SARL)  ')).toBe('Dupont SARL')
    expect(nettoyerRecherche('FA-2026-09-34')).toBe('FA-2026-09-34')
    expect(nettoyerRecherche('50%*')).toBe('50')
    expect(nettoyerRecherche(null)).toBe('')
    expect(nettoyerRecherche('a'.repeat(200))).toHaveLength(80)
  })

  it('messageDepuisCorps lit { error } / { message } ou le texte', () => {
    expect(messageDepuisCorps('{"error":"Taux de TVA non légal : 6 %"}')).toBe('Taux de TVA non légal : 6 %')
    expect(messageDepuisCorps('{"message":"Unauthorized"}')).toBe('Unauthorized')
    expect(messageDepuisCorps('{"ok":false}')).toBeNull()
    expect(messageDepuisCorps('Service indisponible')).toBe('Service indisponible')
    expect(messageDepuisCorps('<html>502</html>')).toBeNull()
    expect(messageDepuisCorps('')).toBeNull()
  })
})

// ── d.bis Lignes supplémentaires ────────────────────────────────────────────
describe('extraLinesHtCts / extraLinesTvaCts / extraLinesTtcCts', () => {
  const attente30: DeliveryExtraLine = { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 }
  const forfait5: DeliveryExtraLine  = { label: 'Palettes', quantity: 5, amount_ht_cts: 1200, tva_rate: 10 }

  it('null / undefined / vide → 0 partout (rétrocompat)', () => {
    for (const val of [null, undefined, []]) {
      expect(extraLinesHtCts(val)).toBe(0)
      expect(extraLinesTvaCts(val)).toBe(0)
      expect(extraLinesTtcCts(val)).toBe(0)
    }
  })

  it('somme HT × quantité', () => {
    expect(extraLinesHtCts([attente30])).toBe(3000)
    expect(extraLinesHtCts([forfait5])).toBe(6000)     // 5 × 1200
    expect(extraLinesHtCts([attente30, forfait5])).toBe(9000)
  })

  it('TVA calculée ligne par ligne (chaque taux propre)', () => {
    // attente30 : 3000 × 20 % = 600
    // forfait5  : 6000 × 10 % = 600
    expect(extraLinesTvaCts([attente30])).toBe(600)
    expect(extraLinesTvaCts([forfait5])).toBe(600)
    expect(extraLinesTvaCts([attente30, forfait5])).toBe(1200)
  })

  it('TTC = HT + TVA (invariant préservé)', () => {
    const lines = [attente30, forfait5]
    expect(extraLinesTtcCts(lines)).toBe(extraLinesHtCts(lines) + extraLinesTvaCts(lines))
    expect(extraLinesTtcCts(lines)).toBe(10200)
  })

  it('tolère quantity manquante (défaut 1)', () => {
    const line = { label: 'x', amount_ht_cts: 500, tva_rate: 20 } as DeliveryExtraLine
    expect(extraLinesHtCts([line])).toBe(500)
  })

  // Clamp aligné sur pennylane-invoice : quantity ≤ 0 ou non finie ≡ 1.
  // Garantit qu'un HT positif ne devient jamais un total négatif localement,
  // et que les KPIs / affichages restent cohérents avec ce que Pennylane facture.
  it('quantity: 0 → traité comme 1', () => {
    const line: DeliveryExtraLine = { label: 'x', quantity: 0, amount_ht_cts: 500, tva_rate: 20 }
    expect(extraLinesHtCts([line])).toBe(500)
    expect(extraLinesTvaCts([line])).toBe(100)
    expect(extraLinesTtcCts([line])).toBe(extraLinesHtCts([line]) + extraLinesTvaCts([line]))
  })

  it('quantity: -2 → traité comme 1 (pas de HT négatif)', () => {
    const line: DeliveryExtraLine = { label: 'x', quantity: -2, amount_ht_cts: 500, tva_rate: 20 }
    expect(extraLinesHtCts([line])).toBe(500)
    expect(extraLinesTvaCts([line])).toBe(100)
    expect(extraLinesHtCts([line])).toBeGreaterThanOrEqual(0)
  })

  it('amount_ht_cts: 0 → contribue 0 (HT, TVA, TTC)', () => {
    const line: DeliveryExtraLine = { label: 'x', quantity: 1, amount_ht_cts: 0, tva_rate: 20 }
    expect(extraLinesHtCts([line])).toBe(0)
    expect(extraLinesTvaCts([line])).toBe(0)
    expect(extraLinesTtcCts([line])).toBe(0)
  })

  // Le front n'impose pas les taux légaux FR (fait par l'Edge à la facturation).
  // Ici on vérifie juste que le calcul reste correct pour un taux atypique.
  it('tva_rate non standard (ex 7) → TVA calculée sans erreur, invariant HT+TVA=TTC', () => {
    const line: DeliveryExtraLine = { label: 'x', quantity: 1, amount_ht_cts: 10000, tva_rate: 7 }
    const ht = extraLinesHtCts([line])
    const tva = extraLinesTvaCts([line])
    const ttc = extraLinesTtcCts([line])
    expect(ht).toBe(10000)
    expect(tva).toBe(700)
    expect(ttc).toBe(ht + tva)
  })
})

describe('deliveryTotalHtCts / deliveryTotalTtcCts', () => {
  it('combine ligne principale + extras', () => {
    const d = row({ amount_ht_cts: 24000, amount_ttc_cts: 28800, extra_lines: [
      { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
    ] })
    expect(deliveryTotalHtCts(d)).toBe(27000)
    expect(deliveryTotalTtcCts(d)).toBe(28800 + 3600) // 3000 + 20% = 3600
  })

  it('sans extras → même comportement que effectiveHtCts / effectiveTtcCts', () => {
    const d = row({ amount_ht_cts: 24000, amount_ttc_cts: 28800, extra_lines: [] })
    expect(deliveryTotalHtCts(d)).toBe(effectiveHtCts(d))
    expect(deliveryTotalTtcCts(d)).toBe(effectiveTtcCts(d))
  })

  it('extra_lines absent (données legacy) → même comportement', () => {
    const d = row({ amount_ht_cts: 24000, amount_ttc_cts: 28800 })
    expect(deliveryTotalHtCts(d)).toBe(24000)
    expect(deliveryTotalTtcCts(d)).toBe(28800)
  })

  // Scénario intégration ODT #4003 : principale 240 HT à 20 % + 100 HT
  // d'extras à 20 % → 408 € TTC = 40800 cts. Verrouille le calcul de bout en bout.
  it('scénario 240 HT + 100 HT extras à 20 % → TTC = 40800 cts', () => {
    const d = row({
      amount_ht_cts: 24000, amount_ttc_cts: 28800,
      extra_lines: [
        { label: 'Retour palette', quantity: 1, amount_ht_cts: 5000, tva_rate: 20 },
        { label: 'Frais d’attente', quantity: 1, amount_ht_cts: 5000, tva_rate: 20 },
      ],
    })
    expect(deliveryTotalHtCts(d)).toBe(34000)
    expect(deliveryTotalTtcCts(d)).toBe(40800)
  })
})

// ── e. Formatage ─────────────────────────────────────────────────────────────────
describe('formatCents', () => {
  it('formate en euros FR', () => {
    expect(norm(formatCents(0))).toBe('0,00 €')
    expect(norm(formatCents(100))).toBe('1,00 €')
    expect(norm(formatCents(123456))).toBe('1 234,56 €')
  })
})

// Garde-fou : DeliveryStatus reste cohérent avec les clés de TRANSITIONS.
const _statusKeys: DeliveryStatus[] = Object.keys(TRANSITIONS) as DeliveryStatus[]
void _statusKeys

describe('libelleDelaiPaiement', () => {
  it('affiche les jours quand il n’y a pas d’étiquette', () => {
    expect(libelleDelaiPaiement({ payment_terms: 45, payment_terms_label: null }))
      .toBe('45 jours')
  })

  it('n’affiche pas deux fois la même chose', () => {
    // L'étiquette « 30 » et 30 jours disent la même chose.
    expect(libelleDelaiPaiement({ payment_terms: 30, payment_terms_label: '30' }))
      .toBe('30 jours')
  })

  it('montre l’étiquette ET les jours quand ils diffèrent', () => {
    // C'est le nombre qui décide de la date d'échéance : le cacher ferait
    // croire qu'un « fin de mois » vaut trente jours pile.
    expect(libelleDelaiPaiement({ payment_terms: 30, payment_terms_label: '30_fin_mois' }))
      .toBe('30_fin_mois (30 jours)')
  })

  it('se contente de l’étiquette quand les jours manquent', () => {
    expect(libelleDelaiPaiement({ payment_terms: null, payment_terms_label: 'à réception' }))
      .toBe('à réception')
  })

  it('dit « non renseigné » plutôt que d’inventer un délai', () => {
    expect(libelleDelaiPaiement({ payment_terms: null, payment_terms_label: null }))
      .toBe('non renseigné')
    expect(libelleDelaiPaiement({ payment_terms: null, payment_terms_label: '  ' }))
      .toBe('non renseigné')
  })
})

describe('fiche unique', () => {
  const base: FicheASaisir = {
    prestation: 'express', client_id: 'c', date: '2026-10-01',
    pickup_address: 'A', delivery_address: 'B', driver_id: 'd', vehicle_id: 'v',
    expediteur_nom: 'E', destinataire_nom: 'D', marchandise_desc: 'Colis', nb_colis: '2',
    poids_kg_reel: '', volume_m3: '1', ht_cts: 5000,
    creneau_retrait_debut: '', creneau_retrait_fin: '', creneau_livraison_debut: '', creneau_livraison_fin: '',
  }
  it('fiche complète : rien ne manque (volume suffit sans poids)', () => {
    expect(manquesFiche(base)).toEqual({ enregistrer: [], partir: [], lv: [], facturer: [] })
  })
  it('seuls client et date bloquent l’enregistrement', () => {
    const m = manquesFiche({ ...base, client_id: '', delivery_address: '', driver_id: '', ht_cts: null })
    expect(m.enregistrer).toEqual(['client'])
    expect(m.partir).toEqual(['adresse de livraison', 'chauffeur'])
    expect(m.facturer).toEqual(['prix HT'])
  })
  it('créneau fin avant début bloque', () => {
    expect(manquesFiche({ ...base, creneau_livraison_debut: '14:00', creneau_livraison_fin: '09:00' }).enregistrer)
      .toEqual(['créneau de livraison (fin avant début)'])
  })
  it('forfait : aucun arrêt, aucune LV exigée', () => {
    const m = manquesFiche({ ...base, prestation: 'forfait', delivery_address: '', pickup_address: '', driver_id: '', vehicle_id: '', nb_colis: '' })
    expect(m.partir).toEqual([])
    expect(m.lv).toEqual([])
  })
  it('poids ET volume vides : manque pour la LV', () => {
    expect(manquesFiche({ ...base, volume_m3: '' }).lv).toEqual(['poids ou volume'])
  })
  it('libellés de créneau et de durée', () => {
    expect(libelleCreneau('09:00:00', '12:30:00')).toBe('9h – 12h30')
    expect(libelleCreneau(null, '14:00')).toBe('avant 14h')
    expect(libelleCreneau('08:00', null)).toBe('à partir de 8h')
    expect(libelleCreneau(null, null)).toBeNull()
    expect(libelleDuree(25)).toBe('25 min')
    expect(libelleDuree(65)).toBe('1 h 05')
    expect(heureSaisie('7:05:00')).toBe('07:05')
    expect(creneauInvalide('10:00', '10:00')).toBe(true)
    expect(blocsPrestation('mise_a_dispo').retrait).toBe(false)
    expect(blocsPrestation(null).retrait).toBe(true)
  })
})
