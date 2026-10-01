import { supabase } from '../../app/providers'
import { deliveryTotalTtcCts, type DeliveryExtraLine } from '../../shared/lib/money'
import type { AutreEntreeRow, EncaissementFilters, EncaissementRow } from './encaissement.types'

type RawRow = {
  id: string
  client_id: string | null
  amount_ttc_cts: number | null
  extra_lines: DeliveryExtraLine[] | null
  invoiced_at: string | null
  paid_at: string | null
  pennylane_invoice_id: string | null
  clients: { name: string } | null
}

export async function getEncaissements(
  filters: EncaissementFilters = {}
): Promise<{ data: EncaissementRow[] | null; error: unknown }> {
  let q = supabase
    .from('deliveries')
    // extra_lines requis pour que le TTC affiché = ce qui a été facturé
    // (ligne principale + lignes supplémentaires envoyées à Pennylane).
    .select('id, client_id, amount_ttc_cts, extra_lines, autoliquidation, invoiced_at, paid_at, pennylane_invoice_id, clients!client_id(name)')
    .eq('statut', 'payee')
    .order('paid_at', { ascending: false })

  if (filters.client_id && filters.client_id !== 'all') q = q.eq('client_id', filters.client_id)
  if (filters.date_from) q = q.gte('paid_at', filters.date_from)
  // paid_at / settled_at sont des horodatages : « jusqu'au JJ » = avant le lendemain 0 h.
  if (filters.date_to)   q = q.lt('paid_at', lendemain(filters.date_to))

  const { data, error } = await q
  if (error || !data) return { data: null, error }

  const rows: EncaissementRow[] = (data as unknown as RawRow[]).map(r => ({
    id: r.id,
    client_name: r.clients?.name ?? '—',
    effective_ttc_cts: deliveryTotalTtcCts(r),
    invoiced_at: r.invoiced_at,
    paid_at: r.paid_at,
    pennylane_invoice_id: r.pennylane_invoice_id,
  }))

  return { data: rows, error: null }
}

export async function getAutresEntrees(
  filters: Pick<EncaissementFilters, 'date_from' | 'date_to'> = {}
): Promise<{ data: AutreEntreeRow[] | null; error: unknown }> {
  let q = supabase
    .from('qonto_transactions')
    .select('qonto_id, label, amount_cts, settled_at, justif_type')
    .eq('side', 'credit')
    .or('justif_type.is.null,justif_type.neq.client')
    .order('settled_at', { ascending: false, nullsFirst: false })

  if (filters.date_from) q = q.gte('settled_at', filters.date_from)
  if (filters.date_to)   q = q.lt('settled_at', lendemain(filters.date_to))

  const { data, error } = await q
  if (error || !data) return { data: null, error }
  return { data: data as AutreEntreeRow[], error: null }
}

export async function exportEncaissementsCSV(filters: EncaissementFilters = {}) {
  const { data } = await getEncaissements(filters)
  if (!data) return ''
  const headers = ['Date encaissement', 'Client', 'Montant TTC (€)', 'N° facture']
  const rows = data.map(r => [
    r.paid_at ? new Date(r.paid_at).toLocaleDateString('fr-FR') : '',
    r.client_name,
    (r.effective_ttc_cts / 100).toFixed(2),
    r.pennylane_invoice_id ?? '',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}

/** 'AAAA-MM-JJ' du lendemain (borne exclusive d'un filtre « jusqu'au »). */
function lendemain(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  const d = new Date(a, m - 1, j + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
