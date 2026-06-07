import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS, canTransition, allowedNextStatuses,
  computeAmount, effectiveHtCts, effectiveTtcCts, formatCents, kpiSummary,
} from './livraisons.logic'
import type { ClientTariff } from './livraisons.logic'
import type { DeliveryRow, DeliveryStatus } from './livraisons.types'

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
