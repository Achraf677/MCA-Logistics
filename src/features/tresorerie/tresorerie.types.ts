export interface TreasurySnapshot {
  balance_cts: number
  authorized_balance_cts: number
  iban: string | null
  source: string | null
  fetched_at: string
}

export type TxSide = 'credit' | 'debit'

export interface QontoTx {
  qonto_id: string
  label: string | null
  amount_cts: number
  side: TxSide
  operation_type: string | null
  settled_at: string | null
}
