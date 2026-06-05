// Client API Pennylane v2 (côté Edge Function uniquement).
// Le token n'est JAMAIS loggué. Toute erreur API remonte via ExternalApiError
// (status + responseBody) pour que l'appelant renvoie { ok:false, error, status, body }.
import { fetchJson } from './http.ts';

const BASE_URL = 'https://app.pennylane.com/api/external/v2';

function headers(token: string): Record<string, string> {
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
  /** Code TVA Pennylane (ex. "FR_200" = 20 %, "exempt" = 0 %). */
  vat_rate: string;
}

/**
 * Code TVA Pennylane à partir d'un taux en pourcentage.
 * 20 → "FR_200" · 10 → "FR_100" · 5.5 → "FR_055" · 2.1 → "FR_021" · 0 → "exempt".
 */
export function vatRateCode(ratePct: number): string {
  if (ratePct <= 0) return 'exempt';
  return `FR_${String(Math.round(ratePct * 10)).padStart(3, '0')}`;
}

/** Cherche un client Pennylane par external_reference (= clients.id). Renvoie l'id ou null. */
export async function findCustomerByRef(token: string, ref: string): Promise<number | null> {
  const filter = JSON.stringify([{ field: 'external_reference', operator: 'eq', value: ref }]);
  const url = `${BASE_URL}/customers?filter=${encodeURIComponent(filter)}`;
  const data = await fetchJson<Record<string, unknown>>(url, { headers: headers(token) });
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
  const data = await fetchJson<Record<string, unknown>>(`${BASE_URL}/company_customers`, {
    method: 'POST',
    headers: headers(token),
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
  const data = await fetchJson<Record<string, unknown>>(`${BASE_URL}/customer_invoices`, {
    method: 'POST',
    headers: headers(token),
    body: { ...body, draft: true },
  });
  const invoice = (data.invoice ?? data.customer_invoice ?? data) as PennylaneInvoice;
  return invoice.id;
}

/** Finalise une facture brouillon (draft → finalisée, non modifiable ensuite). Méthode PUT. */
export async function finalizeInvoice(token: string, invoiceId: number): Promise<void> {
  await fetchJson<unknown>(`${BASE_URL}/customer_invoices/${invoiceId}/finalize`, {
    method: 'PUT',
    headers: headers(token),
  });
}
