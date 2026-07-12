import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS, canTransition, allowedNextStatuses,
  computeAmount, effectiveHtCts, effectiveTtcCts, formatCents, kpiSummary,
  extraLinesHtCts, extraLinesTvaCts, extraLinesTtcCts,
  deliveryTotalHtCts, deliveryTotalTtcCts,
} from './livraisons.logic'
import type { ClientTariff } from './livraisons.logic'
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
describe('kpiSummary', () => {
  it('agrège correctement (exclut annulée, CA facturé+payé, attente, mois courant)', () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString().slice(0, 10)
    const old = '2000-01-01'

    const rows: DeliveryRow[] = [
      row({ statut: 'facturee', date: thisMonth, amount_ttc_cts: 12000, montant_ttc_cts: null }),
      row({ statut: 'payee',    date: thisMonth, amount_ttc_cts: 5000,  montant_ttc_cts: null }),
      row({ statut: 'livree',   date: thisMonth, amount_ttc_cts: 9999,  montant_ttc_cts: null }),
      row({ statut: 'annulee',  date: thisMonth, amount_ttc_cts: 99999, montant_ttc_cts: null }),
      row({ statut: 'planifiee', date: old,      amount_ttc_cts: 1000,  montant_ttc_cts: null }),
    ]

    const k = kpiSummary(rows)
    expect(k.nbMois).toBe(3)                  // 3 du mois courant, hors annulée
    expect(k.caFactureCts).toBe(17000)        // facturee 12000 + payee 5000
    expect(k.enAttenteFacturation).toBe(1)    // 1 livree
    expect(k.enAttentePaiementCts).toBe(12000) // facturee uniquement
  })

  it('tableau vide → zéros', () => {
    expect(kpiSummary([])).toEqual({
      nbMois: 0, caFactureCts: 0, enAttenteFacturation: 0, enAttentePaiementCts: 0,
    })
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
