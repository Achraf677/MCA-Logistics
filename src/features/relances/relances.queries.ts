import { supabase } from '../../app/providers'
import { deliveryTotalTtcCts, type DeliveryExtraLine } from '../../shared/lib/money'
import { computeEcheance, computeJoursRetard, computePalier } from './relances.logic'
import type { RelanceRow } from './relances.types'

type RawRow = {
  id: string
  client_id: string
  pennylane_invoice_id: string | null
  pennylane_invoice_number: string | null
  amount_ttc_cts: number | null
  extra_lines: DeliveryExtraLine[] | null
  invoiced_at: string
  clients: { name: string; email: string | null; payment_terms: number } | null
}

export async function getOverdueInvoices(): Promise<{ data: RelanceRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('deliveries')
    // extra_lines requis pour que deliveryTotalTtcCts inclue les lignes supp.
    // dans le montant relancé (sinon on relance un TTC inférieur au dû).
    .select(`
      id, client_id, pennylane_invoice_id, pennylane_invoice_number,
      amount_ttc_cts, extra_lines,
      invoiced_at,
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
      pennylane_invoice_number: raw.pennylane_invoice_number,
      effective_ttc_cts: deliveryTotalTtcCts(raw),
      invoiced_at: raw.invoiced_at,
      echeance_date,
      jours_retard,
      palier: computePalier(jours_retard),
    })
  }

  result.sort((a, b) => b.jours_retard - a.jours_retard)
  return { data: result, error: null }
}

