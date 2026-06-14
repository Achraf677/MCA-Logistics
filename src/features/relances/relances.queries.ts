import { supabase } from '../../app/providers'
import { effectiveTtcCts } from '../../shared/lib/money'
import { computeEcheance, computeJoursRetard, computePalier } from './relances.logic'
import type { RelanceRow } from './relances.types'

type RawRow = {
  id: string
  client_id: string
  pennylane_invoice_id: string | null
  amount_ttc_cts: number | null
  montant_ttc_cts: number | null
  invoiced_at: string
  relance_count: number | null
  last_relance_at: string | null
  clients: { name: string; email: string | null; payment_terms: number } | null
}

export async function getOverdueInvoices(): Promise<{ data: RelanceRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('deliveries')
    .select(`
      id, client_id, pennylane_invoice_id,
      amount_ttc_cts, montant_ttc_cts,
      invoiced_at, relance_count, last_relance_at,
      clients!client_id(name, email, payment_terms)
    `)
    .eq('statut', 'facturee')
    .not('invoiced_at', 'is', null)

  if (error || !data) return { data: null, error }

  const result: RelanceRow[] = []
  for (const raw of data as unknown as RawRow[]) {
    const client = raw.clients
    if (!client) continue
    const pt = client.payment_terms ?? 30
    const echeance_date = computeEcheance(raw.invoiced_at, pt)
    const jours_retard = computeJoursRetard(echeance_date)
    if (jours_retard < 0) continue
    result.push({
      id: raw.id,
      client_id: raw.client_id,
      client_name: client.name,
      client_email: client.email ?? null,
      client_payment_terms: pt,
      pennylane_invoice_id: raw.pennylane_invoice_id,
      effective_ttc_cts: effectiveTtcCts(raw),
      invoiced_at: raw.invoiced_at,
      echeance_date,
      jours_retard,
      palier: computePalier(jours_retard),
      relance_count: raw.relance_count ?? 0,
      last_relance_at: raw.last_relance_at,
    })
  }

  result.sort((a, b) => b.jours_retard - a.jours_retard)
  return { data: result, error: null }
}

export async function markRelanceSent(id: string, currentCount: number) {
  return supabase
    .from('deliveries')
    .update({
      relance_count: currentCount + 1,
      last_relance_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', id)
}

export async function generateRelanceDraft(prompt: string) {
  return supabase.functions.invoke('brouillons-generate', { body: { prompt, type: 'relance' } })
}
