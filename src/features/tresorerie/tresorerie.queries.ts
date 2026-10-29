import { supabase } from '../../app/providers'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'

// ── Lecture seule ─────────────────────────────────────────────────────────────

export async function getLatestSnapshot() {
  return supabase
    .from('treasury_snapshots')
    .select('balance_cts, authorized_balance_cts, iban, source, fetched_at')
    .eq('source', 'qonto')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle<TreasurySnapshot>()
}

/** Derniers soldes du compte pro Pennylane (une ligne par compte et par synchro). */
export async function getSnapshotsPennylane() {
  return supabase
    .from('treasury_snapshots')
    .select('balance_cts, authorized_balance_cts, iban, source, fetched_at')
    .eq('source', 'pennylane')
    .order('fetched_at', { ascending: false })
    .limit(20)
    .returns<TreasurySnapshot[]>()
}

export async function getTransactions() {
  return supabase
    .from('qonto_transactions')
    .select('id, qonto_id, label, amount_cts, side, operation_type, settled_at, charge_id, justif_type, source')
    .order('settled_at', { ascending: false, nullsFirst: false })
    .returns<QontoTx[]>()
}

// ── Déclenchements (Edge Functions — jamais d'appel API externe direct) ────────

export async function syncQonto() {
  return supabase.functions.invoke('qonto-sync', { body: {} })
}

export async function syncPennylaneSolde() {
  return supabase.functions.invoke('pennylane-solde', { body: {} })
}

export async function checkPayments() {
  return supabase.functions.invoke('pennylane-payment-check', { body: {} })
}

/** Fiche brute d'une opération (chargée à l'ouverture du détail, pas dans la liste). */
export async function getDonneesBrutes(id: string) {
  return supabase.from('qonto_transactions').select('raw_data').eq('id', id).maybeSingle<{ raw_data: unknown }>()
}
