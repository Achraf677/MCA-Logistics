import type { DeliveryRow, DeliveryStatus, DeliveryType } from './livraisons.types'

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  brouillon: 'Brouillon',
  validee: 'Validée',
  facturee: 'Facturée',
  payee: 'Payée',
  annulee: 'Annulée',
}

export const STATUS_COLOR: Record<DeliveryStatus, 'muted' | 'info' | 'warning' | 'success' | 'danger'> = {
  brouillon: 'muted',
  validee:   'info',
  facturee:  'warning',
  payee:     'success',
  annulee:   'danger',
}

export const TYPE_LABELS: Record<DeliveryType, string> = {
  medical:    'Médical',
  ecommerce:  'E-commerce',
  retail:     'Retail',
  particulier:'Particulier',
}

export const TYPE_COLOR: Record<DeliveryType, 'info' | 'success' | 'warning' | 'muted'> = {
  medical:    'info',
  ecommerce:  'success',
  retail:     'warning',
  particulier:'muted',
}

const STATUS_ORDER: DeliveryStatus[] = ['brouillon', 'validee', 'facturee', 'payee']

const ADVANCE_LABELS: Partial<Record<DeliveryStatus, string>> = {
  brouillon: 'Valider la livraison',
  validee:   'Marquer facturée',
  facturee:  'Marquer payée',
}

export function nextStatut(current: DeliveryStatus): DeliveryStatus | null {
  const idx = STATUS_ORDER.indexOf(current)
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null
  return STATUS_ORDER[idx + 1]
}

export function advanceLabel(statut: DeliveryStatus): string | null {
  return ADVANCE_LABELS[statut] ?? null
}

export function formatCents(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

export function computeTtcCts(htCts: number, tvaRate: number): number {
  return htCts + Math.round(htCts * tvaRate / 100)
}

export function kpiSummary(rows: DeliveryRow[]) {
  const active = rows.filter(r => r.statut !== 'annulee')
  const caHtCts = active.reduce((s, r) => s + r.montant_ht_cts, 0)
  const nb = active.length
  const nbFacturee = active.filter(r => r.statut === 'facturee' || r.statut === 'payee').length
  const nbPayee = active.filter(r => r.statut === 'payee').length
  return {
    nb,
    caHtCts,
    factureePct: nb ? Math.round(nbFacturee / nb * 100) : 0,
    payeePct:    nb ? Math.round(nbPayee / nb * 100) : 0,
  }
}
