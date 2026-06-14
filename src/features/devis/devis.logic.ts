import type { QuoteStatus } from './devis.types'

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  brouillon: 'Brouillon',
  envoye:    'Envoyé',
  accepte:   'Accepté',
  refuse:    'Refusé',
  expire:    'Expiré',
  facture:   'Facturé',
}

export const STATUS_COLORS: Record<QuoteStatus, 'muted' | 'info' | 'success' | 'danger' | 'warning' | 'purple'> = {
  brouillon: 'muted',
  envoye:    'info',
  accepte:   'success',
  refuse:    'danger',
  expire:    'warning',
  facture:   'purple',
}

export function isExpiredDisplay(valid_until: string | null, statut: QuoteStatus): boolean {
  if (statut !== 'envoye' || !valid_until) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const vd = new Date(valid_until + 'T00:00:00')
  return vd < today
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
