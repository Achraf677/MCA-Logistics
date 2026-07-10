import { addTva, effectiveHtCts, effectiveTtcCts, formatCents } from '../../shared/lib/money'
import type { DeliveryExtraLine, DeliveryRow, DeliveryStatus } from './livraisons.types'

// Réexport pour conserver les imports existants (Livraisons.tsx, DrawerLivraison.tsx, tests).
export { effectiveHtCts, effectiveTtcCts, formatCents }

// ── Lignes supplémentaires ───────────────────────────────────────────────────
// Une livraison peut porter N lignes en plus de la ligne principale (attente,
// retour à vide, forfait…). Toutes vont sur la même facture Pennylane, un seul
// numéro, un seul paiement. TVA propre à chaque ligne.
//
// Invariant : `extra_lines` est toujours un tableau (colonne DB NOT NULL
// DEFAULT '[]'). Les helpers ci-dessous acceptent quand même null/undefined
// pour tolérer les DeliveryRow chargés avant migration ou partiellement.

export function extraLinesHtCts(lines: DeliveryExtraLine[] | null | undefined): number {
  if (!lines || lines.length === 0) return 0
  return lines.reduce((s, l) => {
    const qty = Number(l.quantity) || 1
    return s + Math.round((Number(l.amount_ht_cts) || 0) * qty)
  }, 0)
}

/** TVA totale des extras — calcul ligne par ligne, arrondi TTC puis diff (même
 *  invariant que computeAmount : ht + tva ≡ ttc pour chaque ligne). */
export function extraLinesTvaCts(lines: DeliveryExtraLine[] | null | undefined): number {
  if (!lines || lines.length === 0) return 0
  return lines.reduce((s, l) => {
    const qty = Number(l.quantity) || 1
    const ht = Math.round((Number(l.amount_ht_cts) || 0) * qty)
    const ttc = addTva(ht, (Number(l.tva_rate) || 0) / 100)
    return s + (ttc - ht)
  }, 0)
}

export function extraLinesTtcCts(lines: DeliveryExtraLine[] | null | undefined): number {
  return extraLinesHtCts(lines) + extraLinesTvaCts(lines)
}

/** HT total facturable = ligne principale + extras. */
export function deliveryTotalHtCts(row: DeliveryRow | { extra_lines?: DeliveryExtraLine[] | null } & Parameters<typeof effectiveHtCts>[0]): number {
  return effectiveHtCts(row) + extraLinesHtCts(row.extra_lines)
}

/** TTC total facturable = ligne principale + extras. */
export function deliveryTotalTtcCts(row: DeliveryRow | { extra_lines?: DeliveryExtraLine[] | null } & Parameters<typeof effectiveTtcCts>[0]): number {
  return effectiveTtcCts(row) + extraLinesTtcCts(row.extra_lines)
}

// ── Machine à états ──────────────────────────────────────────────────────────

export const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  // 'livree' directe depuis 'planifiee' : un chauffeur peut livrer un arrêt
  // sans passer explicitement par 'en_cours' (suivi de tournée mobile).
  planifiee: ['en_cours', 'livree', 'annulee'],
  en_cours:  ['livree', 'annulee'],
  livree:    ['facturee'],
  facturee:  ['payee'],
  payee:     [],
  annulee:   [],
}

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as DeliveryStatus]
  return Array.isArray(allowed) && allowed.includes(to as DeliveryStatus)
}

export function allowedNextStatuses(from: string): DeliveryStatus[] {
  return TRANSITIONS[from as DeliveryStatus] ?? []
}

// ── Labels & couleurs ────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours:  'En cours',
  livree:    'Livrée',
  facturee:  'Facturée',
  payee:     'Payée',
  annulee:   'Annulée',
  // Rétro-compat (données legacy)
  brouillon: 'Brouillon',
  validee:   'Validée',
}

export const STATUS_COLORS: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'danger'> = {
  planifiee: 'muted',
  en_cours:  'info',
  livree:    'warning',
  facturee:  'warning',
  payee:     'success',
  annulee:   'danger',
  brouillon: 'muted',
  validee:   'info',
}

export const TRANSITION_ACTION_LABELS: Record<string, Record<string, string>> = {
  planifiee: { en_cours: 'Démarrer', livree: 'Marquer livrée', annulee: 'Annuler la livraison' },
  en_cours:  { livree: 'Marquer livrée', annulee: 'Annuler la livraison' },
  livree:    { facturee: 'Facturer' },
  facturee:  { payee: 'Encaisser' },
}

export const TYPE_LABELS: Record<string, string> = {
  medical:    'Médical',
  ecommerce:  'E-commerce',
  retail:     'Retail',
  particulier:'Particulier',
}

export const TYPE_COLORS: Record<string, 'info' | 'success' | 'warning' | 'muted'> = {
  medical:    'info',
  ecommerce:  'success',
  retail:     'warning',
  particulier:'muted',
}

// ── Calcul du montant ────────────────────────────────────────────────────────

/** Interface minimale du client nécessaire au calcul (pas d'import cross-feature) */
export interface ClientTariff {
  tariff_mode: 'forfait' | 'km' | 'palette' | 'manuel'
  tariff_rate_cts: number | null
}

export interface AmountParams {
  distance_km?: number | null
  pallets?: number | null
  manual_ht_cts?: number | null
  /** TVA manuelle en centimes. Si fournie, surcharge le calcul automatique à tvaRate. */
  manual_tva_cts?: number | null
}

export interface ComputedAmount {
  amount_ht_cts: number
  tva_cts: number
  amount_ttc_cts: number
}

/**
 * Calcule HT/TVA/TTC depuis le tarif client.
 *
 * Deux modes TVA — invariant ht + tva === ttc toujours garanti :
 *   • TVA manuelle (params.manual_tva_cts != null) :
 *       tva_cts = manual_tva_cts ; ttc = ht + tva
 *   • TVA automatique (défaut 20 %) :
 *       ttc = addTva(ht, tvaRate) puis tva = ttc − ht  (différence, jamais ht*rate)
 */
export function computeAmount(
  client: ClientTariff,
  params: AmountParams,
  tvaRate = 0.20,
): ComputedAmount | null {
  let amount_ht_cts: number

  switch (client.tariff_mode) {
    case 'forfait':
      if (client.tariff_rate_cts == null) return null
      amount_ht_cts = client.tariff_rate_cts
      break
    case 'km':
      if (client.tariff_rate_cts == null || params.distance_km == null) return null
      amount_ht_cts = Math.round(client.tariff_rate_cts * params.distance_km)
      break
    case 'palette':
      if (client.tariff_rate_cts == null || params.pallets == null) return null
      amount_ht_cts = Math.round(client.tariff_rate_cts * params.pallets)
      break
    case 'manuel':
      if (params.manual_ht_cts == null) return null
      amount_ht_cts = params.manual_ht_cts
      break
    default:
      return null
  }

  if (params.manual_tva_cts != null) {
    // TVA surchargée par l'utilisateur — ttc = ht + tva (ht+tva===ttc garanti)
    const tva_cts = params.manual_tva_cts
    const amount_ttc_cts = amount_ht_cts + tva_cts
    return { amount_ht_cts, tva_cts, amount_ttc_cts }
  }

  // TVA automatique par différence — addTva arrondit le TTC, tva = ttc − ht
  const amount_ttc_cts = addTva(amount_ht_cts, tvaRate)
  const tva_cts = amount_ttc_cts - amount_ht_cts
  return { amount_ht_cts, tva_cts, amount_ttc_cts }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export function kpiSummary(rows: DeliveryRow[]) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const active   = rows.filter(r => r.statut !== 'annulee')
  const thisMonth = active.filter(r => r.date >= monthStart)

  const caFactureCts = active
    .filter(r => r.statut === 'facturee' || r.statut === 'payee')
    .reduce((s, r) => s + deliveryTotalTtcCts(r), 0)

  const enAttenteFacturation = active.filter(r => r.statut === 'livree').length

  const enAttentePaiementCts = active
    .filter(r => r.statut === 'facturee')
    .reduce((s, r) => s + deliveryTotalTtcCts(r), 0)

  return { nbMois: thisMonth.length, caFactureCts, enAttenteFacturation, enAttentePaiementCts }
}
