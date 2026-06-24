import type { Palier } from './relances.types'

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function computeEcheance(invoiced_at: string, payment_terms: number): string {
  return addDays(invoiced_at, payment_terms)
}

export function computeJoursRetard(echeance_date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const echeance = new Date(echeance_date + 'T00:00:00')
  return Math.floor((today.getTime() - echeance.getTime()) / 86_400_000)
}

export function computePalier(jours: number): Palier {
  if (jours < 8)  return 'J+0'
  if (jours < 15) return 'J+8'
  if (jours < 30) return 'J+15'
  return 'J+30'
}

