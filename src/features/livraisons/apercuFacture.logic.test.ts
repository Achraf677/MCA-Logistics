import { describe, it, expect } from 'vitest'
import {
  buildApercuFacture, buildApercuPayload, estTauxLegal, tauxLignePrincipale, MENTION_AUTOLIQUIDATION,
} from './apercuFacture.logic'
import type { DeliveryExtraLine } from '../../shared/lib/money'
import type { ApercuFactureRow } from './apercuFacture.logic'

// Le spread final applique les overrides APRÈS les défauts : un `null` passé
// explicitement écrase bien le défaut (contrairement à `??` qui l'avalerait).
const row = (over: Partial<ApercuFactureRow> = {}): ApercuFactureRow => ({
  id: 'd1',
  date: '2026-07-19',
  description: 'Transport palette',
  delivery_address: '4 pl Kléber, Strasbourg',
  client_id: 'c1',
  clients: { name: 'Boulangerie Dupont' },
  amount_ht_cts: 10000,
  tva_cts: 2000,
  amount_ttc_cts: 12000,
  extra_lines: [],
  ...over,
})

describe('buildApercuFacture — mono livraison sans extras', () => {
  it('propage client + ligne principale + totaux HT/TVA/TTC', () => {
    const r = buildApercuFacture([row()])
    expect(r.client_name).toBe('Boulangerie Dupont')
    expect(r.count).toBe(1)
    expect(r.mixed_clients).toBe(false)
    expect(r.main_lines).toHaveLength(1)
    expect(r.extra_lines).toEqual([])
    expect(r.main_lines[0].ht_cts).toBe(10000)
    expect(r.main_lines[0].tva_rate).toBe(20)
    expect(r.main_lines[0].tva_cts).toBe(2000)
    expect(r.main_lines[0].ttc_cts).toBe(12000)
    expect(r.totals).toEqual({ ht_cts: 10000, tva_cts: 2000, ttc_cts: 12000 })
  })

  it('libellé réel de l’Edge : description, sinon « Livraison <type> du <date> »', () => {
    const r1 = buildApercuFacture([row({ description: null })])
    expect(r1.main_lines[0].label).toBe('Livraison du 2026-07-19')
    const r2 = buildApercuFacture([row({ description: '  ', type: 'professionnel' })])
    expect(r2.main_lines[0].label).toBe('Livraison professionnel du 2026-07-19')
  })

  it('legacy montant_* utilisé si amount_* nul', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: null, amount_ttc_cts: null, tva_cts: null,
      montant_ht_cts: 5000, montant_ttc_cts: 6000,
    })])
    expect(r.totals.ht_cts).toBe(5000)
    expect(r.totals.ttc_cts).toBe(6000)
    expect(r.totals.tva_cts).toBe(1000)
  })
})

describe('buildApercuFacture — mono livraison avec extras', () => {
  it('somme HT + extras + invariant HT+TVA=TTC', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
      extra_lines: [
        { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
        { label: 'Retour à vide',  quantity: 1, amount_ht_cts: 1500, tva_rate: 20 },
      ],
    })])
    expect(r.extra_lines).toHaveLength(2)
    expect(r.totals.ht_cts).toBe(14500)          // 10000 + 3000 + 1500
    expect(r.totals.tva_cts).toBe(2900)          // 20% de 14500
    expect(r.totals.ttc_cts).toBe(17400)         // 14500 + 2900
    // Invariant global
    expect(r.totals.ht_cts + r.totals.tva_cts).toBe(r.totals.ttc_cts)
  })

  it('quantity ≤ 0 ou NaN → 1 (clamp identique à Pennylane)', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
      extra_lines: [
        { label: 'A', quantity: 0, amount_ht_cts: 500, tva_rate: 20 },
        { label: 'B', quantity: Number.NaN, amount_ht_cts: 500, tva_rate: 20 },
      ],
    })])
    // Chaque ligne est comptée × 1
    expect(r.extra_lines[0].quantity).toBe(1)
    expect(r.extra_lines[1].quantity).toBe(1)
    expect(r.totals.ht_cts).toBe(1000)
  })

  it('label vide → ligne refusée (comme l’Edge), exclue des totaux, bloquante', () => {
    const r = buildApercuFacture([row({
      extra_lines: [{ label: '', quantity: 2, amount_ht_cts: 100, tva_rate: 20 }],
    })])
    expect(r.extra_lines).toEqual([])
    expect(r.invalid_extras).toEqual([{ label: 'Ligne sans libellé', reason: 'Libellé manquant' }])
    expect(r.totals.ht_cts).toBe(10000)
    expect(r.blocages.length).toBe(1)
  })

  it('multi extras à TVA différente — somme par ligne', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
      extra_lines: [
        { label: 'X', quantity: 1, amount_ht_cts: 10000, tva_rate: 20 },
        { label: 'Y', quantity: 1, amount_ht_cts: 10000, tva_rate: 10 },
      ],
    })])
    expect(r.totals.ht_cts).toBe(20000)
    // 20% de 10000 + 10% de 10000 = 2000 + 1000 = 3000
    expect(r.totals.tva_cts).toBe(3000)
    expect(r.totals.ttc_cts).toBe(23000)
  })
})

describe('buildApercuFacture — multi livraisons', () => {
  it('N livraisons du même client → count=N, une main_line par livraison', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000 }),
      row({ id: 'd2', amount_ht_cts: 5000,  tva_cts: 1000, amount_ttc_cts: 6000 }),
      row({ id: 'd3', amount_ht_cts: 3000,  tva_cts: 600,  amount_ttc_cts: 3600 }),
    ])
    expect(r.count).toBe(3)
    expect(r.main_lines).toHaveLength(3)
    expect(r.mixed_clients).toBe(false)
    expect(r.totals.ht_cts).toBe(18000)
    expect(r.totals.tva_cts).toBe(3600)
    expect(r.totals.ttc_cts).toBe(21600)
  })

  it('clients hétérogènes → flag mixed_clients à true', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', clients: { name: 'A' } }),
      row({ id: 'd2', clients: { name: 'B' } }),
    ])
    expect(r.mixed_clients).toBe(true)
    // Le nom retenu = celui du 1er row (contrat documenté).
    expect(r.client_name).toBe('A')
  })

  it('mix ligne principale + extras sur plusieurs livraisons — invariant HT+TVA=TTC', () => {
    const r = buildApercuFacture([
      row({ id: 'd1', amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
            extra_lines: [{ label: 'Att.', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 }] }),
      row({ id: 'd2', amount_ht_cts: 5000, tva_cts: 1000, amount_ttc_cts: 6000,
            extra_lines: [{ label: 'Att.', quantity: 2, amount_ht_cts: 2000, tva_rate: 20 }] }),
    ])
    // Totaux : HT = 10000 + 3000 + 5000 + (2000*2) = 22000
    //         TVA = 20% de 22000 = 4400
    //         TTC = 26400
    expect(r.totals.ht_cts).toBe(22000)
    expect(r.totals.tva_cts).toBe(4400)
    expect(r.totals.ttc_cts).toBe(26400)
    expect(r.totals.ht_cts + r.totals.tva_cts).toBe(r.totals.ttc_cts)
    expect(r.main_lines).toHaveLength(2)
    expect(r.extra_lines).toHaveLength(2)
  })
})

describe('buildApercuFacture — cas limites', () => {
  it('HT à 0 → tva_rate = 0 (pas de division par zéro)', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0 })])
    expect(r.main_lines[0].tva_rate).toBe(0)
    expect(r.totals).toEqual({ ht_cts: 0, tva_cts: 0, ttc_cts: 0 })
  })

  it('extras null/undefined tolérés', () => {
    const r = buildApercuFacture([row({ extra_lines: null })])
    expect(r.extra_lines).toEqual([])
  })
})

// ── buildApercuPayload — mirroir front de la validation pennylane-invoice ───────
describe('buildApercuPayload', () => {
  it('livraison sans extra_lines → une seule ligne (principale), aucun rejet', () => {
    const r = buildApercuPayload(row({ amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000, extra_lines: [] }))
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toEqual({
      label: 'Transport palette', quantity: 1, amount_ht_cts: 10000, vat_rate_pct: 20,
    })
    expect(r.invalidExtras).toEqual([])
  })

  it('2 extra_lines valides → 3 lignes au total (principale + 2), aucun rejet', () => {
    const r = buildApercuPayload(row({
      amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
      extra_lines: [
        { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
        { label: 'Retour à vide',  quantity: 2, amount_ht_cts: 1500, tva_rate: 10 },
      ],
    }))
    expect(r.lines).toHaveLength(3)
    expect(r.lines[1]).toEqual({ label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, vat_rate_pct: 20 })
    expect(r.lines[2]).toEqual({ label: 'Retour à vide', quantity: 2, amount_ht_cts: 1500, vat_rate_pct: 10 })
    expect(r.invalidExtras).toEqual([])
  })

  it('1 extra invalide (taux TVA hors barème) → filtré et reporté dans invalidExtras', () => {
    const r = buildApercuPayload(row({
      amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
      extra_lines: [
        { label: 'Attente 30 min', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 },
        { label: 'Forfait spécial', quantity: 1, amount_ht_cts: 1000, tva_rate: 8 },
      ],
    }))
    // Principale + seulement l'extra valide → l'extra à 8% est exclu.
    expect(r.lines).toHaveLength(2)
    expect(r.lines.map(l => l.label)).toEqual(['Transport palette', 'Attente 30 min'])
    expect(r.invalidExtras).toEqual([{ label: 'Forfait spécial', reason: 'Taux TVA non standard (8 %)' }])
  })

  it('extra à HT ≤ 0 → filtré et reporté', () => {
    const r = buildApercuPayload(row({
      amount_ht_cts: 10000, tva_cts: 2000, amount_ttc_cts: 12000,
      extra_lines: [{ label: 'Ligne à 0', quantity: 1, amount_ht_cts: 0, tva_rate: 20 }],
    }))
    expect(r.lines).toHaveLength(1)
    expect(r.invalidExtras).toEqual([{ label: 'Ligne à 0', reason: 'Montant HT invalide' }])
  })

  it('taux TVA légaux acceptés : 0, 2.1, 5.5, 10, 20 %', () => {
    for (const rate of [0, 2.1, 5.5, 10, 20]) {
      const r = buildApercuPayload(row({
        amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0,
        extra_lines: [{ label: `Taux ${rate}`, quantity: 1, amount_ht_cts: 1000, tva_rate: rate }],
      }))
      expect(r.invalidExtras).toEqual([])
      expect(r.lines).toHaveLength(1)
    }
  })

  it('ligne principale HT ≤ 0 → absente du payload (pas de ligne à 0 envoyée)', () => {
    const r = buildApercuPayload(row({ amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0, extra_lines: [] }))
    expect(r.lines).toEqual([])
  })

  it('extraLines explicite prime sur delivery.extra_lines', () => {
    const r = buildApercuPayload(
      row({ amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0, extra_lines: [{ label: 'ignoré', quantity: 1, amount_ht_cts: 1, tva_rate: 20 }] }),
      [{ label: 'utilisé', quantity: 1, amount_ht_cts: 500, tva_rate: 20 }],
    )
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].label).toBe('utilisé')
  })
})

// ── Alignement sur l'Edge (lot « l'argent ne se perd plus ») ─────────────────
describe('buildApercuFacture — taux, autoliquidation, blocages', () => {
  it('taux au dixième : 5,5 % stocké reste 5,5 %', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 10000, tva_cts: 550, amount_ttc_cts: 10550, tva_rate: 5.5 })])
    expect(r.main_lines[0].tva_rate).toBe(5.5)
    expect(r.main_lines[0].tva_cts).toBe(550)
    expect(r.blocages).toEqual([])
  })

  it('taux stocké en chaîne (numeric) accepté', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 10000, tva_cts: 1000, amount_ttc_cts: 11000, tva_rate: '10.00' })])
    expect(r.main_lines[0].tva_rate).toBe(10)
  })

  it('petit montant : le taux stocké évite la dérive d’arrondi (99 cts à 20 %)', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 99, tva_cts: 20, amount_ttc_cts: 119, tva_rate: 20 })])
    expect(r.main_lines[0].tva_rate).toBe(20)
    expect(r.blocages).toEqual([])
  })

  it('TVA saisie ne correspondant à aucun taux légal → bloquant, exclue des totaux', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 10000, tva_cts: 800, amount_ttc_cts: 10800, tva_rate: 20 })])
    expect(r.main_lines[0].tva_rate).toBe(8)
    expect(r.main_lines[0].blocage).toContain('non légal')
    expect(r.blocages.length).toBe(1)
    expect(r.totals.ht_cts).toBe(0)
  })

  it('ligne principale HT ≤ 0 → bloquant', () => {
    const r = buildApercuFacture([row({ amount_ht_cts: 0, tva_cts: 0, amount_ttc_cts: 0 })])
    expect(r.main_lines[0].blocage).toBe('Montant HT manquant ou nul')
    expect(r.blocages.length).toBe(1)
  })

  it('autoliquidation : TVA 0, TTC = HT, extras à 0 %, mention dans le libellé', () => {
    const r = buildApercuFacture([row({
      amount_ht_cts: 10000, tva_cts: 0, amount_ttc_cts: 10000, tva_rate: 0, autoliquidation: true,
      extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 3000, tva_rate: 20 }],
    })])
    expect(r.main_lines[0].autoliquidation).toBe(true)
    expect(r.main_lines[0].label).toBe(`Transport palette — ${MENTION_AUTOLIQUIDATION}`)
    expect(r.main_lines[0].tva_cts).toBe(0)
    expect(r.extra_lines[0].tva_rate).toBe(0)
    expect(r.extra_lines[0].tva_total_cts).toBe(0)
    expect(r.totals).toEqual({ ht_cts: 13000, tva_cts: 0, ttc_cts: 13000 })
    expect(r.blocages).toEqual([])
  })

  it('autoliquidation : un extra à taux « non standard » n’est pas bloquant (code autoliq.)', () => {
    const r = buildApercuFacture([row({
      tva_rate: 0, tva_cts: 0, autoliquidation: true,
      extra_lines: [{ label: 'X', quantity: 1, amount_ht_cts: 100, tva_rate: 8 }],
    })])
    expect(r.blocages).toEqual([])
  })

  it('extra invalide : exclu des totaux et bloquant', () => {
    const r = buildApercuFacture([row({
      extra_lines: [
        { label: 'OK', quantity: 1, amount_ht_cts: 1000, tva_rate: 20 },
        { label: 'KO', quantity: 1, amount_ht_cts: 1000, tva_rate: 8 },
      ],
    })])
    expect(r.extra_lines.map(e => e.label)).toEqual(['OK'])
    expect(r.totals).toEqual({ ht_cts: 11000, tva_cts: 2200, ttc_cts: 13200 })
    expect(r.blocages).toEqual(['Ligne supplémentaire « KO » : Taux TVA non standard (8 %)'])
  })

  it('extra sans taux → prend le taux de la ligne principale (comme l’Edge)', () => {
    const r = buildApercuFacture([row({
      tva_rate: 10, tva_cts: 1000, amount_ttc_cts: 11000,
      extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 1000 } as unknown as DeliveryExtraLine],
    })])
    expect(r.extra_lines[0].tva_rate).toBe(10)
  })

  it('clients mélangés → bloquant', () => {
    const r = buildApercuFacture([row({ id: 'a', clients: { name: 'A' } }), row({ id: 'b', clients: { name: 'B' } })])
    expect(r.blocages[0]).toContain('clients différents')
  })
})

describe('tauxLignePrincipale / estTauxLegal', () => {
  it('taux légaux', () => {
    for (const t of [0, 2.1, 5.5, 10, 20]) expect(estTauxLegal(t)).toBe(true)
    for (const t of [6, 8, 19, 5.4, Number.NaN]) expect(estTauxLegal(t)).toBe(false)
  })
  it('sans taux stocké : déduit au dixième', () => {
    expect(tauxLignePrincipale(1000, 55, null)).toBe(5.5)
    expect(tauxLignePrincipale(1000, null, null)).toBe(20)
  })
})

describe('buildApercuPayload — autoliquidation et blocage principal', () => {
  it('autoliquidation : vat_rate_pct null sur toutes les lignes', () => {
    const r = buildApercuPayload(row({
      autoliquidation: true, tva_rate: 0, tva_cts: 0,
      extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 500, tva_rate: 20 }],
    }))
    expect(r.lines.map(l => l.vat_rate_pct)).toEqual([null, null])
    expect(r.blocagePrincipal).toBeNull()
  })
  it('taux principal non légal → blocagePrincipal', () => {
    const r = buildApercuPayload(row({ tva_cts: 800, tva_rate: null }))
    expect(r.lines).toEqual([])
    expect(r.blocagePrincipal).toContain('non légal')
  })
})

describe('relevé de messagerie (miroir Edge)', () => {
  it('payload en quantité de colis', () => {
    const r = buildApercuPayload({
      id: 'm1', date: '2026-09-30', description: null, client_id: 'c', prestation: 'messagerie',
      nb_colis: 1240, prix_unitaire_cts: 100, amount_ht_cts: 124000, tva_cts: 24800, amount_ttc_cts: 148800,
      tva_rate: 20, extra_lines: [],
    })
    expect(r.lines[0]).toMatchObject({ label: 'Messagerie septembre 2026 — colis livrés', quantity: 1240, amount_ht_cts: 100 })
  })
})
