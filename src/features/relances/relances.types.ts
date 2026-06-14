export type Palier = 'J+0' | 'J+8' | 'J+15' | 'J+30'

export interface RelanceRow {
  id: string
  client_id: string
  client_name: string
  client_email: string | null
  client_payment_terms: number
  pennylane_invoice_id: string | null
  /** Montant TTC effectif en centimes (v2 ?? legacy fallback) */
  effective_ttc_cts: number
  invoiced_at: string
  echeance_date: string
  jours_retard: number
  palier: Palier
  relance_count: number
  last_relance_at: string | null
}
