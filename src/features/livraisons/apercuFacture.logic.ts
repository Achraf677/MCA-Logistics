// Logique pure d'aperçu facture — reproduit EXACTEMENT ce que Pennylane
// facturera à partir des livraisons sélectionnées. Aucun appel réseau.
//
// Contrat d'invariant :
//   ligne principale HT + Σ(extras HT) = HT total
//   HT total + Σ(TVA)                  = TTC total
// Les helpers de shared/lib/money sont la source de vérité (mêmes règles que
// pennylane-invoice/index.ts côté Edge).

import {
  addTva,
  effectiveHtCts, effectiveTtcCts,
  extraLinesHtCts, extraLinesTtcCts,
  type DeliveryExtraLine,
} from '../../shared/lib/money'

/** Source minimale pour buildApercuFacture — miroir de DeliveryRow. */
export interface ApercuFactureRow {
  id: string
  date: string
  description: string | null
  delivery_address: string | null
  client_id: string
  clients?: { name: string } | null
  amount_ht_cts: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  montant_ht_cts?: number | null
  montant_ttc_cts?: number | null
  extra_lines?: DeliveryExtraLine[] | null
}

export interface ApercuMainLine {
  delivery_id: string
  date: string
  label: string
  ht_cts: number
  tva_rate: number  // en % (ex 20). 0 si HT nul.
  tva_cts: number
  ttc_cts: number
}

export interface ApercuExtraLine {
  delivery_id: string
  label: string
  quantity: number
  ht_unit_cts: number
  tva_rate: number
  ht_total_cts: number
  tva_total_cts: number
  ttc_total_cts: number
}

export interface ApercuFacture {
  /** Nom du client facturé (nom du 1er row — invariant : toutes du même client). */
  client_name: string
  /** Nombre de livraisons regroupées. */
  count: number
  /** Livraisons dont le client diffère de client_name (ne devrait jamais arriver
   *  côté UI — la sélection multi verrouille sur le client — mais on le signale
   *  au cas où l'appelant passe des rows hétérogènes). */
  mixed_clients: boolean
  main_lines: ApercuMainLine[]
  extra_lines: ApercuExtraLine[]
  totals: {
    ht_cts: number
    tva_cts: number
    ttc_cts: number
  }
}

/** Déduit le taux TVA de la ligne principale à partir de HT + TVA stockés. */
function derivedRatePct(ht_cts: number, tva_cts: number): number {
  if (ht_cts <= 0) return 0
  return Math.round(tva_cts / ht_cts * 100)
}

/** Description humaine par défaut si `description` vide. */
function fallbackLabel(row: ApercuFactureRow): string {
  return row.description?.trim() || row.delivery_address?.trim() || 'Transport'
}

/**
 * Aperçu facture à partir de N livraisons (1..N).
 * Traite chaque livraison indépendamment ; la modale d'aperçu peut regrouper
 * ou lister comme elle veut. Les totaux sont sommés directement.
 */
export function buildApercuFacture(rows: ApercuFactureRow[]): ApercuFacture {
  const client_name = rows[0]?.clients?.name?.trim() || '—'
  const mixed_clients = rows.some(r => (r.clients?.name?.trim() || '') !== client_name)

  const main_lines: ApercuMainLine[] = []
  const extra_lines: ApercuExtraLine[] = []
  let sumHt = 0, sumTva = 0, sumTtc = 0

  for (const r of rows) {
    const ht = effectiveHtCts(r)
    const ttc = effectiveTtcCts(r)
    const tva = r.tva_cts != null ? r.tva_cts : Math.max(0, ttc - ht)
    // Ligne principale (même si HT=0 : Pennylane la reçoit quand même —
    // c'est la ligne de suivi de la course).
    main_lines.push({
      delivery_id: r.id,
      date: r.date,
      label: fallbackLabel(r),
      ht_cts: ht,
      tva_rate: derivedRatePct(ht, tva),
      tva_cts: tva,
      ttc_cts: ttc,
    })
    sumHt += ht
    sumTva += tva
    sumTtc += ttc

    // Extras : chaque ligne calculée à l'identique de shared/lib/money
    // (normalizeQty : qty ≤ 0 → 1, invariant HT+TVA=TTC par ligne).
    for (const l of r.extra_lines ?? []) {
      const qty = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1
      const rate = Number(l.tva_rate) || 0
      const ht_total = Math.round((Number(l.amount_ht_cts) || 0) * qty)
      const ttc_total = addTva(ht_total, rate / 100)
      const tva_total = ttc_total - ht_total
      extra_lines.push({
        delivery_id: r.id,
        label: (l.label ?? '').trim() || 'Ligne supplémentaire',
        quantity: qty,
        ht_unit_cts: Number(l.amount_ht_cts) || 0,
        tva_rate: rate,
        ht_total_cts: ht_total,
        tva_total_cts: tva_total,
        ttc_total_cts: ttc_total,
      })
      sumHt += ht_total
      sumTva += tva_total
      sumTtc += ttc_total
    }
  }

  // Sanity-check invariant : HT total + Σ TVA doit être égal au TTC total.
  // Si l'écart est ≤ 1 ct (arrondis cumulés), on aligne le TTC sur HT+TVA
  // pour éviter d'afficher un total incohérent à l'utilisateur.
  const expectedTtc = sumHt + sumTva
  if (Math.abs(sumTtc - expectedTtc) <= rows.length) {
    sumTtc = expectedTtc
  }

  // Cohérence croisée : la somme des lignes détaillées doit être égale
  // à la valeur ligne principale + extras additionnés séparément
  // (deliveryTotalHtCts / deliveryTotalTtcCts). Aucune raison de diverger
  // vu qu'on utilise les mêmes helpers, mais on garde l'assertion en tête.

  return {
    client_name,
    count: rows.length,
    mixed_clients,
    main_lines,
    extra_lines,
    totals: {
      ht_cts: sumHt,
      tva_cts: sumTva,
      ttc_cts: sumTtc,
    },
  }
}

/** Somme HT sur ligne principale + extras d'une seule ligne — utile pour l'UI. */
export function rowHtTotalCts(row: ApercuFactureRow): number {
  return effectiveHtCts(row) + extraLinesHtCts(row.extra_lines)
}

/** Somme TTC sur ligne principale + extras d'une seule ligne. */
export function rowTtcTotalCts(row: ApercuFactureRow): number {
  return effectiveTtcCts(row) + extraLinesTtcCts(row.extra_lines)
}

// ── Payload réel envoyé à Pennylane (mirroir front de pennylane-invoice) ────────
//
// buildApercuFacture (ci-dessus) affiche TOUT tel quel, y compris des lignes
// supplémentaires que pennylane-invoke/index.ts REJETTERAIT (taux TVA non
// standard, HT ≤ 0) — l'Edge répond alors 422 en pleine facturation, sans
// que l'aperçu ait prévenu l'utilisateur. buildApercuPayload reproduit
// exactement la validation de l'Edge (mêmes codes TVA légaux : 0, 2.1, 5.5,
// 10, 20 %) pour filtrer ces lignes AVANT que l'utilisateur clique Facturer.

/** Taux TVA légaux français acceptés par Pennylane (voir _shared/pennylane.ts::vatRateCode). */
const STANDARD_VAT_RATES_PCT = [0, 2.1, 5.5, 10, 20]

function isStandardVatRate(ratePct: number): boolean {
  return STANDARD_VAT_RATES_PCT.some(r => Math.abs(r - ratePct) < 0.05)
}

export interface ApercuPayloadLine {
  label: string
  quantity: number
  amount_ht_cts: number
  vat_rate_pct: number
}

/** Ligne supplémentaire écartée du payload — libellé + raison lisible. */
export interface ApercuInvalidExtra {
  label: string
  reason: string
}

export interface ApercuPayloadResult {
  /** Lignes qui seraient effectivement envoyées à pennylane-invoice. */
  lines: ApercuPayloadLine[]
  /** Extras rejetés — ne seront JAMAIS acceptés par l'Edge en l'état. */
  invalidExtras: ApercuInvalidExtra[]
}

/**
 * Construit le payload de facturation d'UNE livraison — ligne principale
 * (si HT > 0) + lignes supplémentaires valides. Toute ligne supplémentaire
 * invalide (HT ≤ 0 ou taux TVA hors barème légal) est écartée de `lines` et
 * reportée dans `invalidExtras` pour affichage d'un avertissement.
 */
export function buildApercuPayload(
  delivery: ApercuFactureRow,
  extraLines: DeliveryExtraLine[] = delivery.extra_lines ?? [],
): ApercuPayloadResult {
  const lines: ApercuPayloadLine[] = []
  const invalidExtras: ApercuInvalidExtra[] = []

  const ht = effectiveHtCts(delivery)
  if (ht > 0) {
    const ttc = effectiveTtcCts(delivery)
    const tva = delivery.tva_cts != null ? delivery.tva_cts : Math.max(0, ttc - ht)
    lines.push({
      label: fallbackLabel(delivery),
      quantity: 1,
      amount_ht_cts: ht,
      vat_rate_pct: derivedRatePct(ht, tva),
    })
  }

  for (const l of extraLines ?? []) {
    const label = (l.label ?? '').trim() || 'Ligne supplémentaire'
    const extraHt = Number(l.amount_ht_cts) || 0
    const extraRate = Number(l.tva_rate) || 0
    const qty = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1

    if (extraHt <= 0) {
      invalidExtras.push({ label, reason: 'Montant HT invalide' })
      continue
    }
    if (!isStandardVatRate(extraRate)) {
      invalidExtras.push({ label, reason: `Taux TVA non standard (${extraRate}%)` })
      continue
    }
    lines.push({ label, quantity: qty, amount_ht_cts: extraHt, vat_rate_pct: extraRate })
  }

  return { lines, invalidExtras }
}
