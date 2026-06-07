// Client API Pennylane v2 (côté Edge Function uniquement).
// Le token n'est JAMAIS loggué. Toute erreur API remonte via ExternalApiError
// (status + responseBody) pour que l'appelant renvoie { ok:false, error, status, body }.
import { fetchJson } from './http.ts';
const BASE_URL = 'https://app.pennylane.com/api/external/v2';
function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    // Migration API 2026 : phase cleanup à partir du 01/07/2026.
    'X-Use-2026-API-Changes': 'true'
  };
}
const LEGAL_VAT_CODES = {
  200: 'FR_200',
  100: 'FR_100',
  55: 'FR_055',
  21: 'FR_021',
  0: 'FR_000'
};
export function vatRateCode(ratePct) {
  const key = Math.round(ratePct * 10);
  return LEGAL_VAT_CODES[key] ?? null;
}
export async function findCustomerByRef(token, ref) {
  const filter = JSON.stringify([
    {
      field: 'external_reference',
      operator: 'eq',
      value: ref
    }
  ]);
  const url = `${BASE_URL}/customers?filter=${encodeURIComponent(filter)}`;
  const data = await fetchJson(url, {
    headers: headers(token)
  });
  const items = data.items ?? data.customers ?? (Array.isArray(data) ? data : []);
  return items.length > 0 ? items[0].id : null;
}
export async function createCompanyCustomer(token, body) {
  const data = await fetchJson(`${BASE_URL}/company_customers`, {
    method: 'POST',
    headers: headers(token),
    body
  });
  const customer = data.customer ?? data.company_customer ?? data;
  return customer.id;
}
export async function createDraftInvoice(token, body) {
  const data = await fetchJson(`${BASE_URL}/customer_invoices`, {
    method: 'POST',
    headers: headers(token),
    body: {
      ...body,
      draft: true
    }
  });
  const invoice = data.invoice ?? data.customer_invoice ?? data;
  return invoice.id;
}
export async function finalizeInvoice(token, invoiceId) {
  await fetchJson(`${BASE_URL}/customer_invoices/${invoiceId}/finalize`, {
    method: 'PUT',
    headers: headers(token)
  });
}
/**
 * Détection de paiement : liste les transactions rapprochées pour une facture client.
 * Liste non vide => facture payée (règle v1). Renvoie le tableau brut (vide si aucune).
 */ export async function getMatchedTransactions(token, invoiceId) {
  const data = await fetchJson(`${BASE_URL}/customer_invoices/${invoiceId}/matched_transactions`, {
    headers: headers(token)
  });
  const list = data.matched_transactions ?? data.items ?? [];
  return Array.isArray(list) ? list : [];
}
