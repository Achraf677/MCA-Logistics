import { supabase } from '../../app/providers'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'

// ── Lecture seule ─────────────────────────────────────────────────────────────

export async function getLatestSnapshot() {
  return supabase
    .from('treasury_snapshots')
    .select('balance_cts, authorized_balance_cts, iban, source, fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle<TreasurySnapshot>()
}

export async function getTransactions() {
  return supabase
    .from('qonto_transactions')
    .select('qonto_id, label, amount_cts, side, operation_type, settled_at')
    .order('settled_at', { ascending: false, nullsFirst: false })
    .returns<QontoTx[]>()
}

// ── Déclenchements (Edge Functions — jamais d'appel API externe direct) ────────

export async function syncQonto() {
  return supabase.functions.invoke('qonto-sync', { body: {} })
}

export async function checkPayments() {
  return supabase.functions.invoke('pennylane-payment-check', { body: {} })
}
