import { supabase } from '../../app/providers'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'
import type { ChargePick } from '../../shared/types/charges'

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
    .select('qonto_id, label, amount_cts, side, operation_type, settled_at, charge_id, justif_type')
    .order('settled_at', { ascending: false, nullsFirst: false })
    .returns<QontoTx[]>()
}

export async function getChargesForRapprochement(): Promise<ChargePick[]> {
  const { data } = await supabase
    .from('charges')
    .select([
      'id', 'date', 'label', 'montant_ht_cts', 'montant_ttc_cts',
      'tva_cts', 'tva_rate', 'receipt_url', 'pennylane_id',
      'supplier_id', 'category_id',
      'suppliers!supplier_id(name)',
      'charge_categories!category_id(name, slug, type)',
    ].join(', '))
    .order('date', { ascending: false })
  return (data ?? []) as unknown as ChargePick[]
}

// ── Rapprochement Qonto↔charge ────────────────────────────────────────────────

export async function linkChargeToTransaction(qontoId: string, chargeId: string) {
  return supabase
    .from('qonto_transactions')
    .update({ charge_id: chargeId })
    .eq('qonto_id', qontoId)
}

export async function unlinkChargeFromTransaction(qontoId: string) {
  return supabase
    .from('qonto_transactions')
    .update({ charge_id: null })
    .eq('qonto_id', qontoId)
}

export async function setJustifType(qontoId: string, type: string) {
  return supabase
    .from('qonto_transactions')
    .update({ justif_type: type })
    .eq('qonto_id', qontoId)
}

export async function clearJustifType(qontoId: string) {
  return supabase
    .from('qonto_transactions')
    .update({ justif_type: null })
    .eq('qonto_id', qontoId)
}

export async function getTeamMemberNames(): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('full_name')
    .eq('active', true)
  return (data ?? []).map((m: { full_name: string }) => m.full_name).filter(Boolean)
}

export async function getClientNames(): Promise<string[]> {
  const { data } = await supabase
    .from('clients')
    .select('name')
    .eq('active', true)
  return (data ?? []).map((c: { name: string }) => c.name).filter(Boolean)
}

// ── Déclenchements (Edge Functions — jamais d'appel API externe direct) ────────

export async function syncQonto() {
  return supabase.functions.invoke('qonto-sync', { body: {} })
}

export async function checkPayments() {
  return supabase.functions.invoke('pennylane-payment-check', { body: {} })
}
