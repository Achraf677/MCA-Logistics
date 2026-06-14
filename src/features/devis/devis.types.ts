export type QuoteStatus =
  | 'brouillon'
  | 'envoye'
  | 'accepte'
  | 'refuse'
  | 'expire'
  | 'facture'
  | 'transforme'

export interface Quote {
  id: string
  company_id: string
  client_id: string
  date: string
  valid_until: string | null
  description: string | null
  amount_ht_cts: number | null
  tva_rate: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  statut: QuoteStatus
  pennylane_quote_id: string | null
  pennylane_invoice_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  clients?: { name: string } | null
}
