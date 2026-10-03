// Règles des lignes Pennylane côté front — PUR, aucun appel réseau.
//
// MIROIR de supabase/functions/_shared/lignesFacture.ts : même choix de taux,
// même libellé, même relevé au colis, même autoliquidation, mêmes refus.
// Utilisé par l'aperçu de facture (features/livraisons/apercuFacture.logic.ts)
// et par le devis (features/devis/devis.logic.ts). Test de parité :
// supabase/functions/_shared/lignesFacture.test.ts.

import { addTva, type DeliveryExtraLine } from './money'

/** Mention légale portée sur la ligne principale d'une facture / d'un devis
 *  autoliquidé (identique à MENTION_AUTOLIQUIDATION côté Edge). */
export const MENTION_AUTOLIQUIDATION = 'Autoliquidation — TVA due par le preneur, art. 259-1 du CGI'

/** Taux TVA légaux français acceptés par Pennylane (en dixièmes pour éviter le flottant). */
const TAUX_LEGAUX_DIXIEMES = [0, 21, 55, 100, 200]

export function estTauxLegal(ratePct: number): boolean {
  return Number.isFinite(ratePct) && TAUX_LEGAUX_DIXIEMES.includes(Math.round(ratePct * 10))
}

/** Miroir de `tauxLignePrincipale` (Edge). */
export function tauxLignePrincipale(
  htCts: number,
  tvaCts: number | null,
  tvaRate: number | string | null | undefined,
): number {
  const stocke = tvaRate != null && tvaRate !== '' && Number.isFinite(Number(tvaRate))
    ? Number(tvaRate) : null
  const tva = tvaCts ?? Math.round(htCts * (stocke ?? 20) / 100)
  if (stocke != null && estTauxLegal(stocke)
      && Math.abs(Math.round(htCts * stocke / 100) - tva) <= 1) {
    return stocke
  }
  if (htCts > 0) return Math.round(tva / htCts * 1000) / 10
  return stocke ?? 20
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function moisFr(date: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '')
  return m ? `${MOIS_FR[Number(m[2]) - 1]} ${m[1]}` : ''
}

/** Miroir de `quantiteColis` (Edge) : quantité seulement si colis × prix = HT. */
export function quantiteColis(
  r: { prestation?: string | null; nb_colis?: number | null; prix_unitaire_cts?: number | null; ht: number },
): { quantity: number; unit_cts: number } | null {
  if (r.prestation !== 'messagerie') return null
  const n = Number(r.nb_colis), pu = Number(r.prix_unitaire_cts)
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(pu) || pu <= 0) return null
  return n * pu === r.ht ? { quantity: n, unit_cts: pu } : null
}

/**
 * Miroir de `libelleCourse` (Edge) : description, sinon « Livraison <type> du
 * <date> », suivie de « — Réf. <référence client> » si elle n'y figure pas déjà.
 */
export function libelleCourse(row: {
  description: string | null; type?: string | null; date: string | null
  reference_client?: string | null; prestation?: string | null
}): string {
  const desc = row.description?.trim()
  const defaut = row.prestation === 'messagerie'
    ? `Messagerie ${moisFr(row.date)} — colis livrés`.replace('  ', ' ')
    : ['Livraison', row.type ?? '', 'du', row.date ?? ''].filter(s => s !== '').join(' ')
  const base = desc || defaut
  const ref = row.reference_client?.trim()
  return ref && !base.includes(ref) ? `${base} — Réf. ${ref}` : base
}

// ── Devis (lot U3) : mêmes lignes que la facture ─────────────────────────────

function qte(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 1
}

function pct(n: number): string {
  return String(n).replace('.', ',')
}

/** Miroir de `libelleDevis` (Edge). */
export function libelleDevis(q: {
  description: string | null; date: string | null
  reference_client?: string | null; prestation?: string | null
}): string {
  if (q.prestation === 'messagerie' && !q.description?.trim()) {
    const ref = q.reference_client?.trim()
    return ref ? `Messagerie — prix au colis — Réf. ${ref}` : 'Messagerie — prix au colis'
  }
  return libelleCourse({ ...q, type: null })
}

/** Source d'un devis (fiche de prix) — miroir de `DevisAFacturer` (Edge). */
export interface DevisSource {
  date: string | null
  description: string | null
  reference_client?: string | null
  prestation?: string | null
  quantite: number | null
  /** null = ancien devis : la ligne principale = HT total − suppléments. */
  prix_unitaire_cts: number | null
  /** Totaux stockés (ancien devis seulement). */
  amount_ht_cts?: number | null
  tva_cts?: number | null
  tva_rate: number | null
  autoliquidation: boolean
  extra_lines: DeliveryExtraLine[] | null | undefined
}

export interface LigneDevis {
  label: string
  quantity: number
  /** HT unitaire envoyé à Pennylane. */
  amount_ht_cts: number
  /** Taux en % ; null en autoliquidation. */
  vat_rate_pct: number | null
  ht_total_cts: number
  tva_total_cts: number
}

export interface LignesDevis {
  lignes: LigneDevis[]
  /** Première raison qui ferait refuser le devis par l'Edge, sinon null. */
  blocage: string | null
  principalHtCts: number
  supplementsHtCts: number
  htCts: number
  /** TVA calculée LIGNE PAR LIGNE, comme Pennylane. 0 en autoliquidation. */
  tvaCts: number
  ttcCts: number
}

/** Miroir de `construireLignesDevis` (Edge) + totaux ligne par ligne. */
export function lignesDevis(q: DevisSource): LignesDevis {
  const extras = q.extra_lines ?? []
  const supplementsHtCts = extras.reduce(
    (s, l) => s + Math.round(qte(l.quantity) * (Number(l.amount_ht_cts) || 0)), 0)
  const nouveau = q.prix_unitaire_cts != null && Number.isFinite(Number(q.prix_unitaire_cts))
  const quantity = nouveau ? qte(q.quantite) : 1
  const unit = nouveau ? Math.round(Number(q.prix_unitaire_cts)) : 0
  const principalHtCts = nouveau ? Math.round(quantity * unit) : Number(q.amount_ht_cts ?? 0) - supplementsHtCts
  const autoliq = q.autoliquidation === true
  const stocke = q.tva_rate != null ? Number(q.tva_rate) : null
  const taux = stocke != null && estTauxLegal(stocke)
    ? stocke
    : tauxLignePrincipale(Number(q.amount_ht_cts ?? 0), q.tva_cts ?? null, q.tva_rate)

  const lignes: LigneDevis[] = []
  let blocage: string | null = null
  // TVA ligne par ligne (comme Pennylane) ; 0 en autoliquidation.
  const tvaDe = (htTotal: number, rate: number) =>
    autoliq || !estTauxLegal(rate) ? 0 : addTva(htTotal, rate / 100) - htTotal
  let tvaCts = 0

  if (principalHtCts <= 0) blocage = 'Montant HT de la ligne principale manquant ou nul'
  else if (!autoliq && !estTauxLegal(taux)) {
    blocage = `Taux de TVA non légal (${pct(taux)} %) — taux acceptés : 0 ; 2,1 ; 5,5 ; 10 ; 20 %`
  } else {
    const base = libelleDevis(q)
    const tva = tvaDe(principalHtCts, taux)
    tvaCts += tva
    lignes.push({
      label: autoliq ? `${base} — ${MENTION_AUTOLIQUIDATION}` : base,
      quantity, amount_ht_cts: nouveau ? unit : principalHtCts, vat_rate_pct: autoliq ? null : taux,
      ht_total_cts: principalHtCts, tva_total_cts: tva,
    })
  }

  for (const l of extras) {
    const label = (l.label ?? '').trim()
    const qty = qte(l.quantity)
    const htUnit = Number(l.amount_ht_cts)
    const rawRate = (l as { tva_rate?: unknown }).tva_rate
    const rate = rawRate == null || rawRate === '' ? taux : Number(rawRate)
    if (!label) { blocage ??= 'Ligne supplémentaire sans libellé'; continue }
    if (!Number.isFinite(htUnit) || htUnit <= 0) { blocage ??= `Ligne supplémentaire « ${label} » : montant HT invalide`; continue }
    if (!autoliq && !estTauxLegal(rate)) { blocage ??= `Ligne supplémentaire « ${label} » : taux de TVA non légal (${pct(rate)} %)`; continue }
    const u = Math.round(htUnit)
    const htTotal = Math.round(u * qty)
    const tva = tvaDe(htTotal, rate)
    tvaCts += tva
    lignes.push({
      label, quantity: qty, amount_ht_cts: u, vat_rate_pct: autoliq ? null : rate,
      ht_total_cts: htTotal, tva_total_cts: tva,
    })
  }

  const principal = Math.max(0, principalHtCts)
  const htCts = principal + supplementsHtCts
  return { lignes, blocage, principalHtCts: principal, supplementsHtCts, htCts, tvaCts, ttcCts: htCts + tvaCts }
}
