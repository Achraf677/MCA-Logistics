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

export function buildRelancePrompt(params: {
  client_name: string
  invoice_id: string | null
  ttc_eur: number
  echeance_date: string
  jours_retard: number
}): string {
  const { client_name, invoice_id, ttc_eur, echeance_date, jours_retard } = params
  const echeanceFr = new Date(echeance_date + 'T00:00:00').toLocaleDateString('fr-FR')
  const lines: (string | null)[] = [
    'Société émettrice : MCA Logistics',
    `Client destinataire : ${client_name}`,
    invoice_id ? `Numéro de facture : ${invoice_id}` : null,
    `Montant TTC dû : ${ttc_eur.toFixed(2)} €`,
    `Date d'échéance contractuelle : ${echeanceFr}`,
    `Retard actuel : ${jours_retard} jour${jours_retard > 1 ? 's' : ''}`,
    'Ton souhaité : courtois et professionnel en toutes circonstances, quel que soit le retard.',
    'Rédige la relance de paiement.',
  ]
  return lines.filter(Boolean).join('\n')
}
