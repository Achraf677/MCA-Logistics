import type { Client, DeliveryForEncours, TariffMode } from './clients.types'
import { formatMoney } from '../../shared/lib/money'

export const CLIENT_TYPE_LABELS: Record<NonNullable<Client['type']>, string> = {
  medical:    'Médical',
  ecommerce:  'E-commerce',
  retail:     'Retail / Palettes',
  particulier:'Particulier',
}

export const CLIENT_TYPE_COLORS: Record<NonNullable<Client['type']>, string> = {
  medical:    'info',
  ecommerce:  'success',
  retail:     'warning',
  particulier:'muted',
}

export const TARIFF_MODE_LABELS: Record<TariffMode, string> = {
  forfait:  'Forfait',
  km:       'Au kilomètre',
  palette:  'À la palette',
  manuel:   'Manuel',
}

export function validateSiret(siret: string): boolean {
  return /^\d{14}$/.test(siret.replace(/\s/g, ''))
}

export function getTypeLabel(type: Client['type']): string {
  return type ? CLIENT_TYPE_LABELS[type] : '—'
}

export function countByType(clients: Client[]): Record<string, number> {
  return clients.reduce((acc, c) => {
    const key = c.type ?? 'non_defini'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}

export function getTariffLabel(client: Pick<Client, 'tariff_mode' | 'tariff_rate_cts'>): string {
  const modeLabel = TARIFF_MODE_LABELS[client.tariff_mode]
  if (client.tariff_mode === 'manuel' || !client.tariff_rate_cts) return modeLabel
  const rate = formatMoney(client.tariff_rate_cts)
  switch (client.tariff_mode) {
    case 'forfait':  return `Forfait ${rate}`
    case 'km':       return `${rate} / km`
    case 'palette':  return `${rate} / palette`
  }
}

export function paymentStatusOf(
  delivery: Pick<DeliveryForEncours, 'statut' | 'invoiced_at' | 'payment_terms'>,
  today: Date
): 'a_jour' | 'du' | 'en_retard' {
  if (delivery.statut === 'payee') return 'a_jour'
  if (!delivery.invoiced_at) return 'du'
  const due = new Date(delivery.invoiced_at)
  due.setDate(due.getDate() + delivery.payment_terms)
  return today <= due ? 'du' : 'en_retard'
}

export function computeEncours(
  deliveries: DeliveryForEncours[]
): { total_cts: number; overdue_cts: number; count: number } {
  const today = new Date()
  const factured = deliveries.filter(d => d.statut === 'facturee')
  let total_cts = 0
  let overdue_cts = 0
  for (const d of factured) {
    const amount = d.amount_ttc_cts ?? d.montant_ttc_cts ?? 0
    total_cts += amount
    if (paymentStatusOf(d, today) === 'en_retard') overdue_cts += amount
  }
  return { total_cts, overdue_cts, count: factured.length }
}
