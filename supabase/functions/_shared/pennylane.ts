// Client API Pennylane v2 (côté Edge Function uniquement).
// Le token n'est JAMAIS loggué. Toute erreur API remonte via ExternalApiError
// (status + responseBody) pour que l'appelant renvoie { ok:false, error, status, body }.
import { fetchJson } from './http.ts';

/** URL de base Pennylane V2 — source unique dans tout le repo. */
export const PENNYLANE_BASE = 'https://app.pennylane.com/api/external/v2';

/** Lit PENNYLANE_API_TOKEN depuis Deno.env. Lève une erreur si absent.
 *  Point d'entrée unique — aucune autre Edge Function ne lit Deno.env('PENNYLANE…'). */
export function pennylaneToken(): string {
  const t = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!t) throw new Error('PENNYLANE_API_TOKEN manquant');
  return t;
}

/** Headers Bearer + flag API 2026, à passer à chaque appel Pennylane. */
export function pennylaneHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    // Migration API 2026 : phase cleanup à partir du 01/07/2026.
    'X-Use-2026-API-Changes': 'true',
  };
}

export interface PennylaneCustomer {
  id: number;
}

export interface PennylaneInvoice {
  id: number;
}

export interface InvoiceLine {
  label: string;
  quantity: number;
  unit: string;
  /** Prix unitaire HT en euros, en chaîne (ex. "150.00"). */
  raw_currency_unit_price: string;
  /** Code TVA Pennylane (ex. "FR_200" = 20 %). */
  vat_rate: string;
}

/**
 * Codes TVA légaux français mappés vers les codes Pennylane.
 * Clé = taux en dixièmes de point (20 % → 200) pour éviter les imprécisions flottantes.
 * 20 % → FR_200 · 10 % → FR_100 · 5,5 % → FR_055 · 2,1 % → FR_021 · 0 % → FR_000.
 */
const LEGAL_VAT_CODES: Record<number, string> = {
  200: 'FR_200',
  100: 'FR_100',
  55: 'FR_055',
  21: 'FR_021',
  0: 'FR_000',
};

/**
 * Renvoie le code Pennylane UNIQUEMENT si le taux correspond exactement à un taux
 * légal français connu. Sinon `null` : on ne devine jamais un code pour un taux
 * atypique/libre — l'appelant doit alors refuser de facturer.
 */
export function vatRateCode(ratePct: number): string | null {
  const key = Math.round(ratePct * 10);
  return LEGAL_VAT_CODES[key] ?? null;
}

/** Cherche un client Pennylane par external_reference (= clients.id). Renvoie l'id ou null. */
export async function findCustomerByRef(token: string, ref: string): Promise<number | null> {
  const filter = JSON.stringify([{ field: 'external_reference', operator: 'eq', value: ref }]);
  const url = `${PENNYLANE_BASE}/customers?filter=${encodeURIComponent(filter)}`;
  const data = await fetchJson<Record<string, unknown>>(url, { headers: pennylaneHeaders(token) });
  const items = (data.items ?? data.customers ?? (Array.isArray(data) ? data : [])) as PennylaneCustomer[];
  return items.length > 0 ? items[0].id : null;
}

export interface BillingAddress {
  address: string;
  postal_code: string;
  city: string;
  /** Code pays ISO 3166-1 alpha-2 (ex. "FR"). Renommé country_alpha2 par l'API 2026. */
  country_alpha2: string;
}

/** Crée un client société Pennylane. Renvoie l'id. billing_address est requis par l'API. */
export async function createCompanyCustomer(
  token: string,
  body: {
    name: string;
    emails: string[];
    external_reference: string;
    billing_address: BillingAddress;
  },
): Promise<number> {
  const data = await fetchJson<Record<string, unknown>>(`${PENNYLANE_BASE}/company_customers`, {
    method: 'POST',
    headers: pennylaneHeaders(token),
    body,
  });
  const customer = (data.customer ?? data.company_customer ?? data) as PennylaneCustomer;
  return customer.id;
}

/** Crée une facture client en brouillon. Renvoie l'id de la facture. */
export async function createDraftInvoice(
  token: string,
  body: {
    customer_id: number;
    date: string;
    deadline: string;
    invoice_lines: InvoiceLine[];
  },
): Promise<number> {
  const data = await fetchJson<Record<string, unknown>>(`${PENNYLANE_BASE}/customer_invoices`, {
    method: 'POST',
    headers: pennylaneHeaders(token),
    body: { ...body, draft: true },
  });
  const invoice = (data.invoice ?? data.customer_invoice ?? data) as PennylaneInvoice;
  return invoice.id;
}

/** Finalise une facture brouillon (draft → finalisée, non modifiable ensuite). Méthode PUT. */
export async function finalizeInvoice(token: string, invoiceId: number): Promise<void> {
  await fetchJson<unknown>(`${PENNYLANE_BASE}/customer_invoices/${invoiceId}/finalize`, {
    method: 'PUT',
    headers: pennylaneHeaders(token),
  });
}

/**
 * Lit le numéro de facture lisible (ex. "FA-2026-06-1") depuis Pennylane.
 * Appelé juste après finalizeInvoice pour stocker le numéro en base.
 * Retourne null en cas d'erreur (ne lève pas d'exception).
 */
export async function getInvoiceNumber(token: string, invoiceId: number): Promise<string | null> {
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `${PENNYLANE_BASE}/customer_invoices/${invoiceId}`,
      { headers: pennylaneHeaders(token) },
    );
    const invoice = (data.invoice ?? data.customer_invoice ?? data) as Record<string, unknown>;
    return (invoice.invoice_number as string) ?? null;
  } catch {
    return null;
  }
}

/** Crée un devis Pennylane. Renvoie l'id et le quote_number (ex. "DE-2026-06-2"). */
export async function createQuote(
  token: string,
  body: { customer_id: number; date: string; deadline: string; invoice_lines: InvoiceLine[] },
): Promise<{ id: number; quote_number: string | null }> {
  const data = await fetchJson<Record<string, unknown>>(`${PENNYLANE_BASE}/quotes`, {
    method: 'POST',
    headers: pennylaneHeaders(token),
    body: { ...body, currency: 'EUR', language: 'fr_FR' },
  });
  const quote = (data.quote ?? data) as { id: number; quote_number?: string };
  return { id: quote.id, quote_number: quote.quote_number ?? null };
}

/**
 * Lit le numéro de devis lisible (ex. "DE-2026-06-2") depuis Pennylane.
 * Retourne null en cas d'erreur (ne lève pas d'exception).
 */
export async function getQuoteNumber(token: string, quoteId: number): Promise<string | null> {
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `${PENNYLANE_BASE}/quotes/${quoteId}`,
      { headers: pennylaneHeaders(token) },
    );
    const q = (data.quote ?? data) as Record<string, unknown>;
    return (q.quote_number as string) ?? null;
  } catch {
    return null;
  }
}

/** Crée une facture client finalisée à partir d'un devis. Renvoie l'id de la facture.
 *  Scope requis : customer_invoices:all. */
export async function createInvoiceFromQuote(token: string, quoteId: number): Promise<number> {
  const data = await fetchJson<Record<string, unknown>>(
    `${PENNYLANE_BASE}/customer_invoices/create_from_quote`,
    { method: 'POST', headers: pennylaneHeaders(token), body: { quote_id: quoteId, draft: false } },
  );
  const invoice = (data.invoice ?? data.customer_invoice ?? data) as { id: number };
  return invoice.id;
}
