// Logique pure d'aperçu facture — reproduit ce que Pennylane facturera à
// partir des livraisons sélectionnées. Aucun appel réseau.
//
// MIROIR de supabase/functions/_shared/lignesFacture.ts (côté Edge ; règles de
// base dans shared/lib/lignesPennylane.ts, partagées avec le devis) : même
// libellé, même choix de taux (taux stocké s'il est légal et cohérent, sinon
// TVA/HT au dixième), même autoliquidation (toutes les lignes à 0 %), mêmes
// refus. Un test de parité (supabase/functions/_shared/lignesFacture.test.ts)
// compare les deux.
//
// Contrat :
//   - une ligne supplémentaire invalide est EXCLUE des totaux et BLOQUE la
//     facturation (l'Edge refuserait la facture entière) ;
//   - une ligne principale à HT ≤ 0 ou à taux non légal bloque aussi ;
//   - HT total + TVA totale = TTC total (TVA calculée ligne par ligne,
//     comme Pennylane la calcule à partir du prix unitaire et du taux).

import {
  addTva,
  effectiveHtCts, effectiveTtcCts,
  extraLinesHtCts, extraLinesTtcCts,
  type DeliveryExtraLine,
} from '../../shared/lib/money'
import {
  MENTION_AUTOLIQUIDATION, estTauxLegal, tauxLignePrincipale, quantiteColis, libelleCourse,
} from '../../shared/lib/lignesPennylane'

export { MENTION_AUTOLIQUIDATION, estTauxLegal, tauxLignePrincipale, quantiteColis, libelleCourse }

/** Source minimale pour buildApercuFacture — miroir de DeliveryRow. */
export interface ApercuFactureRow {
  id: string
  date: string
  description: string | null
  /** Référence du donneur d'ordre — reprise dans le libellé (miroir Edge). */
  reference_client?: string | null
  /** Messagerie : relevé facturé en quantité (miroir Edge `quantiteColis`). */
  prestation?: string | null
  nb_colis?: number | null
  prix_unitaire_cts?: number | null
  delivery_address?: string | null
  type?: string | null
  client_id: string
  clients?: { name: string } | null
  amount_ht_cts: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  /** Taux stocké en % (colonne numeric → peut arriver en chaîne). */
  tva_rate?: number | string | null
  autoliquidation?: boolean | null
  montant_ht_cts?: number | null
  montant_ttc_cts?: number | null
  extra_lines?: DeliveryExtraLine[] | null
}

export interface ApercuMainLine {
  delivery_id: string
  date: string
  label: string
  ht_cts: number
  /** Taux en % (0 en autoliquidation). */
  tva_rate: number
  tva_cts: number
  ttc_cts: number
  autoliquidation: boolean
  /** Raison bloquante, null si la ligne partira telle quelle. */
  blocage: string | null
  /** Relevé de messagerie : quantité (colis) et prix unitaire envoyés à Pennylane. */
  par_colis?: { quantity: number; unit_cts: number } | null
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

/** Ligne supplémentaire écartée — libellé + raison lisible. */
export interface ApercuInvalidExtra {
  label: string
  reason: string
}

export interface ApercuFacture {
  /** Nom du client facturé (nom du 1er row — invariant : toutes du même client). */
  client_name: string
  /** Nombre de livraisons regroupées. */
  count: number
  /** Livraisons dont le client diffère de client_name. */
  mixed_clients: boolean
  main_lines: ApercuMainLine[]
  /** Lignes supplémentaires VALIDES uniquement (celles qui partiront). */
  extra_lines: ApercuExtraLine[]
  /** Lignes supplémentaires refusées — exclues des totaux. */
  invalid_extras: ApercuInvalidExtra[]
  /** Raisons qui empêchent de facturer (vide = facturable). */
  blocages: string[]
  totals: {
    ht_cts: number
    tva_cts: number
    ttc_cts: number
  }
}

// ── Règles partagées avec l'Edge : shared/lib/lignesPennylane (devis aussi) ──

function pct(n: number): string {
  return String(n).replace('.', ',')
}

interface LignePrincipaleCalculee {
  ht: number
  rate: number
  tva: number
  label: string
  autoliq: boolean
  blocage: string | null
}

function lignePrincipale(r: ApercuFactureRow): LignePrincipaleCalculee {
  const ht = effectiveHtCts(r)
  const autoliq = r.autoliquidation === true
  const base = libelleCourse(r)
  const label = autoliq ? `${base} — ${MENTION_AUTOLIQUIDATION}` : base
  if (ht <= 0) {
    return { ht: 0, rate: 0, tva: 0, label, autoliq, blocage: 'Montant HT manquant ou nul' }
  }
  if (autoliq) return { ht, rate: 0, tva: 0, label, autoliq, blocage: null }
  const rate = tauxLignePrincipale(ht, r.tva_cts, r.tva_rate)
  if (!estTauxLegal(rate)) {
    return {
      ht, rate, tva: addTva(ht, rate / 100) - ht, label, autoliq,
      blocage: `Taux de TVA non légal (${pct(rate)} %) — taux acceptés : 0 ; 2,1 ; 5,5 ; 10 ; 20 %`,
    }
  }
  return { ht, rate, tva: addTva(ht, rate / 100) - ht, label, autoliq, blocage: null }
}

interface ExtraCalcule {
  ok: boolean
  label: string
  reason?: string
  qty: number
  htUnit: number
  rate: number
}

function extrasCalcules(lines: DeliveryExtraLine[] | null | undefined, tauxDefaut: number, autoliq: boolean): ExtraCalcule[] {
  return (lines ?? []).map(l => {
    const label = (l.label ?? '').trim()
    const q = Number(l.quantity)
    const qty = Number.isFinite(q) && q > 0 ? q : 1
    const htUnit = Number(l.amount_ht_cts)
    const rawRate = (l as { tva_rate?: unknown }).tva_rate
    const rate = autoliq ? 0 : (rawRate == null || rawRate === '' ? tauxDefaut : Number(rawRate))
    if (!label) return { ok: false, label: 'Ligne sans libellé', reason: 'Libellé manquant', qty, htUnit: 0, rate }
    if (!Number.isFinite(htUnit) || htUnit <= 0) return { ok: false, label, reason: 'Montant HT invalide', qty, htUnit: 0, rate }
    if (!autoliq && !estTauxLegal(rate)) {
      return { ok: false, label, reason: `Taux TVA non standard (${pct(rate)} %)`, qty, htUnit, rate }
    }
    return { ok: true, label, qty, htUnit: Math.round(htUnit), rate }
  })
}

/**
 * Aperçu facture à partir de N livraisons (1..N).
 */
export function buildApercuFacture(rows: ApercuFactureRow[]): ApercuFacture {
  const client_name = rows[0]?.clients?.name?.trim() || '—'
  const mixed_clients = rows.some(r => (r.clients?.name?.trim() || '') !== client_name)

  const main_lines: ApercuMainLine[] = []
  const extra_lines: ApercuExtraLine[] = []
  const invalid_extras: ApercuInvalidExtra[] = []
  const blocages: string[] = []
  let sumHt = 0, sumTva = 0

  if (mixed_clients) blocages.push('Livraisons de clients différents dans la sélection')

  for (const r of rows) {
    const m = lignePrincipale(r)
    main_lines.push({
      delivery_id: r.id,
      date: r.date,
      label: m.label,
      ht_cts: m.ht,
      tva_rate: m.rate,
      tva_cts: m.tva,
      ttc_cts: m.ht + m.tva,
      autoliquidation: m.autoliq,
      blocage: m.blocage,
      par_colis: m.blocage ? null : quantiteColis({ ...r, ht: m.ht }),
    })
    if (m.blocage) blocages.push(`« ${m.label} » : ${m.blocage}`)
    else { sumHt += m.ht; sumTva += m.tva }

    for (const e of extrasCalcules(r.extra_lines, m.rate, m.autoliq)) {
      if (!e.ok) {
        invalid_extras.push({ label: e.label, reason: e.reason ?? 'Ligne invalide' })
        blocages.push(`Ligne supplémentaire « ${e.label} » : ${e.reason}`)
        continue
      }
      const ht_total = Math.round(e.htUnit * e.qty)
      const tva_total = addTva(ht_total, e.rate / 100) - ht_total
      extra_lines.push({
        delivery_id: r.id,
        label: e.label,
        quantity: e.qty,
        ht_unit_cts: e.htUnit,
        tva_rate: e.rate,
        ht_total_cts: ht_total,
        tva_total_cts: tva_total,
        ttc_total_cts: ht_total + tva_total,
      })
      sumHt += ht_total
      sumTva += tva_total
    }
  }

  return {
    client_name,
    count: rows.length,
    mixed_clients,
    main_lines,
    extra_lines,
    invalid_extras,
    blocages,
    totals: { ht_cts: sumHt, tva_cts: sumTva, ttc_cts: sumHt + sumTva },
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

// ── Payload réel envoyé à Pennylane (miroir front de pennylane-invoice) ────────

export interface ApercuPayloadLine {
  label: string
  quantity: number
  amount_ht_cts: number
  /** Taux en % ; null en autoliquidation (code dédié, pas un taux). */
  vat_rate_pct: number | null
}

export interface ApercuPayloadResult {
  /** Lignes qui seraient effectivement envoyées à pennylane-invoice. */
  lines: ApercuPayloadLine[]
  /** Extras rejetés — ne seront JAMAIS acceptés par l'Edge en l'état. */
  invalidExtras: ApercuInvalidExtra[]
  /** Raison bloquante sur la ligne principale (HT ≤ 0, taux non légal), sinon null. */
  blocagePrincipal: string | null
}

/**
 * Payload de facturation d'UNE livraison — ligne principale (si valide) +
 * lignes supplémentaires valides. Tout ce que l'Edge refuserait est reporté.
 */
export function buildApercuPayload(
  delivery: ApercuFactureRow,
  extraLines: DeliveryExtraLine[] = delivery.extra_lines ?? [],
): ApercuPayloadResult {
  const lines: ApercuPayloadLine[] = []
  const invalidExtras: ApercuInvalidExtra[] = []

  const m = lignePrincipale(delivery)
  if (!m.blocage) {
    const q = quantiteColis({ ...delivery, ht: m.ht })
    lines.push({
      label: m.label, quantity: q?.quantity ?? 1, amount_ht_cts: q?.unit_cts ?? m.ht,
      vat_rate_pct: m.autoliq ? null : m.rate,
    })
  }

  for (const e of extrasCalcules(extraLines, m.rate, m.autoliq)) {
    if (!e.ok) { invalidExtras.push({ label: e.label, reason: e.reason ?? 'Ligne invalide' }); continue }
    lines.push({ label: e.label, quantity: e.qty, amount_ht_cts: e.htUnit, vat_rate_pct: m.autoliq ? null : e.rate })
  }

  return { lines, invalidExtras, blocagePrincipal: m.blocage }
}
