// Client API Pennylane v2 (côté Edge Function uniquement).
// Le token n'est JAMAIS loggué. Toute erreur API remonte via ExternalApiError
// (status + responseBody) pour que l'appelant renvoie { ok:false, error, status, body }.
import { fetchJson } from './http.ts';
import { codeTvaLegal } from './lignesFacture.ts';

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
 * Code TVA Pennylane de l'AUTOLIQUIDATION.
 *
 * Ce n'est PAS `FR_000`. Un taux à 0 % est une opération taxable au taux zéro ;
 * l'autoliquidation est une opération non soumise à la TVA française, avec
 * report de la taxe sur le preneur — mention légale obligatoire, ligne
 * distincte en déclaration, code de TVA différent.
 *
 * `exempt` est le code documenté par Pennylane pour une opération exonérée. Il
 * reste pilotable par le secret `PENNYLANE_VAT_CODE_AUTOLIQ` : si le cabinet
 * comptable impose un autre code, il se change SANS redeploiement — meme
 * principe que `MISTRAL_MODEL`.
 */
export const VAT_CODE_AUTOLIQUIDATION =
  Deno.env.get('PENNYLANE_VAT_CODE_AUTOLIQ') || 'exempt';

/**
 * Mention legale portee sur la facture autoliquidee.
 *
 * Ajoutee au LIBELLE de la ligne et non a un champ dedie : le libelle est le
 * seul endroit dont on soit certain qu'il figure sur la facture imprimee. Une
 * mention absente rend la facture non conforme — mieux vaut la voir deux fois
 * que pas du tout.
 */
export const MENTION_AUTOLIQUIDATION =
  'Autoliquidation — TVA due par le preneur, art. 259-1 du CGI';

/**
 * Renvoie le code Pennylane UNIQUEMENT si le taux correspond exactement à un taux
 * légal français connu. Sinon `null` : on ne devine jamais un code pour un taux
 * atypique/libre — l'appelant doit alors refuser de facturer.
 */
export function vatRateCode(ratePct: number): string | null {
  // Table des taux légaux : source unique dans lignesFacture.ts (pur, testé).
  return codeTvaLegal(ratePct);
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
    /** N° de TVA intracommunautaire — indispensable sur une facture autoliquidée. */
    vat_number?: string;
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

/**
 * Renseigne le n° de TVA intracommunautaire d'un client société existant
 * (créé avant que le numéro ne soit saisi chez nous). Best-effort : l'appelant
 * ignore l'échec, la facture reste émise.
 */
export async function updateCompanyCustomerVat(
  token: string,
  customerId: number,
  vatNumber: string,
): Promise<void> {
  await fetchJson<unknown>(`${PENNYLANE_BASE}/company_customers/${customerId}`, {
    method: 'PUT',
    headers: pennylaneHeaders(token),
    body: { vat_number: vatNumber },
  });
}

/** Lit l'état de paiement d'une facture client (champs tolérants : l'API a varié). */
export async function getInvoicePaymentState(
  token: string,
  invoiceId: string | number,
): Promise<{ paid: boolean | null; remainingEuros: number | null }> {
  const data = await fetchJson<Record<string, unknown>>(
    `${PENNYLANE_BASE}/customer_invoices/${invoiceId}`,
    { headers: pennylaneHeaders(token) },
  );
  const inv = (data?.invoice ?? data?.customer_invoice ?? data ?? {}) as Record<string, unknown>;
  const paid = typeof inv.paid === 'boolean'
    ? inv.paid
    : (typeof inv.status === 'string' ? inv.status === 'paid' : null);
  const brut = inv.remaining_amount_with_tax ?? inv.remaining_amount ?? null;
  const n = brut == null ? NaN : Number(brut);
  return { paid, remainingEuros: Number.isFinite(n) ? n : null };
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

/**
 * Enregistre un paiement manuel sur une facture Pennylane finalisée.
 * Utilisé quand l'encaissement est déjà réalisé côté MCA (plateforme tierce
 * type Cocolis, virement hors circuit bancaire suivi, etc.) et qu'on veut
 * marquer la facture comme réglée dans Pennylane sans attendre le
 * rapprochement bancaire automatique.
 *
 * `paidAt` : date d'encaissement au format ISO "YYYY-MM-DD".
 * `amountEuros` : montant TTC en euros (ex. 174.00).
 * `source` : moyen de paiement Pennylane ("other" par défaut).
 */
export async function registerInvoicePayment(
  token: string,
  invoiceId: string | number,
  amountEuros: number,
  paidAt: string,
  source = 'other',
): Promise<void> {
  await fetchJson<unknown>(
    `${PENNYLANE_BASE}/customer_invoices/${invoiceId}/register_payment`,
    {
      method: 'POST',
      headers: pennylaneHeaders(token),
      body: { paid_at: paidAt, amount: amountEuros, source },
    },
  );
}
