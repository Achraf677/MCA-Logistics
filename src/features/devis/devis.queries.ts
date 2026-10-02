import { supabase } from '../../app/providers'
import type { Quote, QuoteStatus } from './devis.types'
import { versLivraison } from './devis.logic'

const QUOTE_BASE_COLS = `
      id, company_id, client_id, date, valid_until, description,
      amount_ht_cts, tva_rate, tva_cts, amount_ttc_cts,
      pickup_address, delivery_address, vehicle_id, driver_id, statut,
      pennylane_quote_id, pennylane_quote_number, pennylane_invoice_id, notes, created_at, updated_at,
      clients!client_id(name)`
/** Colonnes de la fiche de prix (migration 20261002090000). */
const QUOTE_PRIX_COLS = ', prestation, unite, quantite, prix_unitaire_cts, extra_lines, reference_client, autoliquidation, accepte_le'

/** Valeurs neutres quand la base n'a pas encore la fiche de prix. */
function completer(q: Record<string, unknown>): Quote {
  return {
    prestation: null, unite: null, prix_unitaire_cts: null, reference_client: null,
    autoliquidation: false, accepte_le: null, ...q,
    extra_lines: Array.isArray(q.extra_lines) ? q.extra_lines : [],
    quantite: q.quantite != null ? Number(q.quantite) : null,
  } as Quote
}

export async function listQuotes(): Promise<{ data: Quote[] | null; error: unknown }> {
  const lire = (cols: string) => supabase.from('quotes').select(cols).order('date', { ascending: false })
  let res = await lire(QUOTE_BASE_COLS + QUOTE_PRIX_COLS)
  // Base en retard d'une migration (42703 = colonne inconnue) : liste lisible quand même.
  if (res.error?.code === '42703') res = await lire(QUOTE_BASE_COLS)
  const rows = (res.data ?? null) as unknown as Record<string, unknown>[] | null
  return { data: rows ? rows.map(completer) : null, error: res.error }
}

export async function createQuote(payload: Omit<Quote, 'id' | 'created_at' | 'updated_at' | 'clients' | 'pennylane_quote_number'>) {
  return supabase.from('quotes').insert(payload).select().single()
}

export async function updateQuote(id: string, payload: Partial<Omit<Quote, 'id' | 'created_at' | 'updated_at' | 'clients'>>) {
  return supabase.from('quotes').update(payload).eq('id', id).select().single()
}

export async function deleteQuote(id: string) {
  return supabase.from('quotes').delete().eq('id', id)
}

/** Ce que le devis lit de la fiche client (tarif, TVA, pays, suppléments). */
export interface ClientDevis {
  id: string
  name: string
  tariff_mode: string | null
  tariff_rate_cts: number | null
  tva_intra: string | null
  pays: string | null
  prestation_defaut: string | null
  supplements: unknown
  retrait_adresse: string | null
}

export async function listClientsLight(): Promise<{ data: ClientDevis[] | null; error: unknown }> {
  const res = await supabase
    .from('clients')
    .select('id, name, tariff_mode, tariff_rate_cts, tva_intra, pays, prestation_defaut, supplements, retrait_adresse')
    .eq('active', true)
    .order('name')
  return { data: res.data as ClientDevis[] | null, error: res.error }
}

export async function updateQuoteStatus(id: string, statut: QuoteStatus) {
  // La date d'acceptation est posée avec le statut (null si on revient en arrière).
  const extra = statut === 'accepte' ? { accepte_le: new Date().toISOString() } : {}
  return supabase.from('quotes').update({ statut, ...extra }).eq('id', id)
}

/**
 * Devis accepté → tarif du client (messagerie : prix au colis). Le prix n'est
 * ensuite plus ressaisi : relevés et courses le lisent dans la fiche client.
 */
export async function appliquerTarifClient(quoteId: string, clientId: string,
  tarif: { tariff_mode: string; tariff_rate_cts: number; prestation_defaut?: string }) {
  const { data, error } = await supabase.from('clients').update(tarif).eq('id', clientId).select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: { message: 'Fiche client non modifiable (droits)' } }
  return supabase.from('quotes').update({ statut: 'transforme' }).eq('id', quoteId)
}

export async function syncQuoteNumber(quoteId: string) {
  return supabase.functions.invoke('pennylane-quote', {
    body: { action: 'sync-number', quote_id: quoteId },
  })
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

/** Crée la course (tout repris du devis, voir `versLivraison`) et renvoie son id. */
export async function transformToDelivery(quote: Quote, date: string, companyId: string): Promise<{ id?: string; error?: { message: string } | null }> {
  const { data, error: dErr } = await supabase.from('deliveries')
    .insert(versLivraison(quote, date, companyId)).select('id').single()
  if (dErr || !data) return { error: dErr ?? { message: 'Course non créée' } }
  const { error } = await supabase.from('quotes').update({ statut: 'transforme' }).eq('id', quote.id)
  return { id: data.id as string, error }
}
