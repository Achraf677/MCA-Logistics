// Edge Function `pennylane-last-numbers`
// Renvoie les derniers numéros de facture et de devis émis cette année chez Pennylane.
// POST — pas de body requis. Réservé à un utilisateur connecté rattaché à une société.
//
// Paramètres Pennylane v2 : le filtre se passe dans `filter` (au singulier, JSON
// encodé) — c'est la forme déjà utilisée avec succès par `findCustomerByRef`
// (_shared/pennylane.ts). `filters` (au pluriel) était ignoré : la liste revenait
// non filtrée, limitée aux 100 premiers documents (les plus anciens).
// Tri : `sort=-date` (plus récent d'abord). Si l'API le refuse pour une
// ressource (4xx), on retombe sur `sort=-id`, puis sans tri, puis sans filtre.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { AuthError, lireAppelant } from '../_shared/auth.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneHeaders, pennylaneToken } from '../_shared/pennylane.ts';

/**
 * Parmi une liste de numéros (ex. "FA-2026-06-12"), renvoie celui de l'année
 * `year` qui est le plus grand selon la clé month*1e5 + seq.
 * Format attendu : *-YYYY-MM-N (ex. FA-2026-06-3 ou DE-2026-01-12).
 */
function maxDocNumber(nums: (string | null | undefined)[], year: number): string | null {
  let best: string | null = null;
  let bestKey = -1;
  for (const n of nums) {
    if (!n) continue;
    const m = n.match(/-(\d{4})-(\d{2})-(\d+)$/);
    if (!m || Number(m[1]) !== year) continue;
    const key = Number(m[2]) * 1e5 + Number(m[3]);
    if (key > bestKey) { bestKey = key; best = n; }
  }
  return best;
}

type Page = Record<string, unknown>;

/** Liste une ressource filtrée sur l'année, en essayant les tris du plus au moins précis. */
async function listerAnnee(
  resource: 'customer_invoices' | 'quotes',
  headers: Record<string, string>,
  year: number,
): Promise<Record<string, unknown>[]> {
  const filter = JSON.stringify([{ field: 'date', operator: 'gteq', value: `${year}-01-01` }]);
  let derniereErreur: unknown = null;
  // Du plus précis au plus tolérant : si un filtre ou un tri n'est pas accepté
  // pour cette ressource, on le retire (maxDocNumber refiltre l'année de toute façon).
  const essais: Record<string, string>[] = [
    { filter, sort: '-date' },
    { filter, sort: '-id' },
    { filter },
    { sort: '-id' },
    {},
  ];
  for (const essai of essais) {
    const qs = new URLSearchParams({ limit: '100', ...essai });
    try {
      const page = await fetchJson<Page>(`${PENNYLANE_BASE}/${resource}?${qs}`, { headers });
      return (page.items ?? page[resource] ?? []) as Record<string, unknown>[];
    } catch (err) {
      derniereErreur = err;
      // Seul un refus de paramètre (4xx hors 401/403/429) justifie de retenter sans ce tri.
      const s = err instanceof ExternalApiError ? err.status ?? 0 : 0;
      if (!(s >= 400 && s < 500) || s === 401 || s === 403 || s === 429) break;
    }
  }
  throw derniereErreur;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Contrôle d'accès : compte connecté, rattaché à une société ─────────────
  try {
    await lireAppelant(req);
  } catch (err) {
    if (err instanceof AuthError) return jsonResponse({ ok: false, error: err.message }, err.status);
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }

  const vide = { last_invoice_number: null, last_quote_number: null };
  try {
    const token = pennylaneToken();
    const headers = pennylaneHeaders(token);
    const year = new Date().getFullYear();

    const [invoiceItems, quoteItems] = await Promise.all([
      listerAnnee('customer_invoices', headers, year),
      listerAnnee('quotes', headers, year),
    ]);

    return jsonResponse({
      last_invoice_number: maxDocNumber(invoiceItems.map(i => i.invoice_number as string), year),
      last_quote_number:   maxDocNumber(quoteItems.map(x => x.quote_number as string), year),
    });
  } catch (err) {
    // Erreur Pennylane → on retourne null proprement, le front ne throw jamais
    console.error('pennylane-last-numbers:', (err as Error)?.message,
      err instanceof ExternalApiError ? JSON.stringify(err.responseBody) : '');
    return jsonResponse(vide);
  }
});
