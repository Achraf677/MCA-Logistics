import { supabase } from '../../app/providers'
import type { Quote, QuoteStatus } from './devis.types'

export async function listQuotes(): Promise<{ data: Quote[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, company_id, client_id, date, valid_until, description,
      amount_ht_cts, tva_rate, tva_cts, amount_ttc_cts, statut,
      pennylane_quote_id, pennylane_invoice_id, notes, created_at, updated_at,
      clients!client_id(name)
    `)
    .order('date', { ascending: false })

  return { data: data as unknown as Quote[] | null, error }
}

export async function createQuote(payload: Omit<Quote, 'id' | 'created_at' | 'updated_at' | 'clients'>) {
  return supabase.from('quotes').insert(payload).select().single()
}

export async function updateQuote(id: string, payload: Partial<Omit<Quote, 'id' | 'created_at' | 'updated_at' | 'clients'>>) {
  return supabase.from('quotes').update(payload).eq('id', id).select().single()
}

export async function deleteQuote(id: string) {
  return supabase.from('quotes').delete().eq('id', id)
}

export async function listClientsLight(): Promise<{ data: { id: string; name: string }[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('active', true)
    .order('name')
  return { data, error }
}

export async function updateQuoteStatus(id: string, statut: QuoteStatus) {
  return supabase.from('quotes').update({ statut }).eq('id', id)
}

export async function sendToPennylane(quoteId: string) {
  return supabase.functions.invoke('pennylane-quote', {
    body: { action: 'create', quote_id: quoteId },
  })
}

export async function convertToInvoice(quoteId: string) {
  return supabase.functions.invoke('pennylane-quote', {
    body: { action: 'convert', quote_id: quoteId },
  })
}
