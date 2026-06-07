export type PaymentMethod = 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'

export interface Payment {
  id: string
  company_id: string
  delivery_id: string | null
  client_id: string | null
  date: string
  amount_cts: number
  method: PaymentMethod | null
  reference: string | null
  qonto_tx_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PaymentRow extends Payment {
  clients: { name: string } | null
  deliveries: { date: string; amount_ttc_cts: number | null; montant_ttc_cts: number } | null
}

export type PaymentInsert = Omit<Payment, 'id' | 'created_at' | 'updated_at'>
export type PaymentUpdate = Partial<Omit<Payment, 'id' | 'company_id' | 'created_at'>>

export interface PaymentFilters {
  method?: PaymentMethod | 'all'
  client_id?: string | 'all'
  date_from?: string
  date_to?: string
}
