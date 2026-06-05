// Client API Qonto v2 (côté Edge Function uniquement) — LECTURE SEULE.
// Le secret n'est JAMAIS loggué. Toute erreur API remonte via ExternalApiError
// (status + responseBody) pour que l'appelant renvoie { ok:false, error, status, body }.
import { fetchJson } from './http.ts';

const BASE_URL = 'https://thirdparty.qonto.com/v2';

/** Auth Qonto : header "Authorization: <slug>:<secret>" (pas de schéma Bearer). */
export function headers(slug: string, secret: string): Record<string, string> {
  return { 'Authorization': `${slug}:${secret}` };
}

export interface QontoBankAccount {
  id: string;
  iban: string;
  balance_cents: number;
  authorized_balance_cents: number;
}

export interface QontoTransaction {
  id: string;
  amount_cents: number;
  side: string;
  operation_type: string;
  label: string;
  settled_at: string | null;
  status: string;
  reference: string | null;
}

/** GET /organization → comptes bancaires (avec soldes en centimes). */
export async function getOrganization(slug: string, secret: string): Promise<QontoBankAccount[]> {
  const data = await fetchJson<{ organization?: { bank_accounts?: QontoBankAccount[] } }>(
    `${BASE_URL}/organization`,
    { headers: headers(slug, secret) },
  );
  return data.organization?.bank_accounts ?? [];
}

/**
 * GET /transactions paginé → toutes les pages concaténées pour un compte.
 * Pagine sur current_page jusqu'à meta.total_pages (per_page=100).
 */
export async function listTransactions(
  slug: string,
  secret: string,
  bankAccountId: string,
): Promise<QontoTransaction[]> {
  const all: QontoTransaction[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `${BASE_URL}/transactions` +
      `?bank_account_id=${encodeURIComponent(bankAccountId)}` +
      `&per_page=100&current_page=${page}`;
    const data = await fetchJson<{
      transactions?: QontoTransaction[];
      meta?: { total_pages?: number };
    }>(url, { headers: headers(slug, secret) });

    all.push(...(data.transactions ?? []));
    totalPages = data.meta?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return all;
}
