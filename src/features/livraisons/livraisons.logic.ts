import { addTva, deliveryTotalTtcCts } from '../../shared/lib/money'
import type { DeliveryRow, DeliveryStatus } from './livraisons.types'

// Réexports pour conserver les imports existants (Livraisons.tsx,
// DrawerLivraison.tsx, tests…). Les helpers vivent désormais dans
// shared/lib/money — même clamp, même comportement — pour être consommables
// depuis d'autres features (TVA, encaissement, relances, assistant) sans
// enfreindre la règle « aucun import entre features/ ».
export {
  effectiveHtCts,
  effectiveTtcCts,
  formatCents,
  extraLinesHtCts,
  extraLinesTvaCts,
  extraLinesTtcCts,
  deliveryTotalHtCts,
  deliveryTotalTtcCts,
} from '../../shared/lib/money'

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
