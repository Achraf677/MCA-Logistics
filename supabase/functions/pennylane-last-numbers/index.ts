// Edge Function `pennylane-last-numbers`
// Renvoie les derniers numéros de facture et de devis émis cette année chez Pennylane.
// GET ou POST — pas de body requis.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneHeaders, pennylaneToken } from '../_shared/pennylane.ts';

/**
 * Parmi une liste de numéros (ex. "FA-2026-06-12"), renvoie celui qui est le plus grand
 * selon la clé year*1e7 + month*1e5 + seq.
 * Format attendu : *-YYYY-MM-N (ex. FA-2026-06-3 ou DE-2026-01-12).
 */
function maxDocNumber(nums: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestKey = -1;
  for (const n of nums) {
    if (!n) continue;
    const m = n.match(/-(\d{4})-(\d{2})-(\d+)$/);
    if (!m) continue;
    const key = Number(m[1]) * 1e7 + Number(m[2]) * 1e5 + Number(m[3]);
    if (key > bestKey) { bestKey = key; best = n; }
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  try {
    const token = pennylaneToken();
    const headers = pennylaneHeaders(token);
    const year = new Date().getFullYear();

    const fInv = encodeURIComponent(
      JSON.stringify([{ field: 'date', operator: 'gteq', value: `${year}-01-01` }])
    );

    const [inv, q] = await Promise.all([
      fetchJson<Record<string, unknown>>(
        `${PENNYLANE_BASE}/customer_invoices?filters=${fInv}&limit=100`,
        { headers },
      ),
      fetchJson<Record<string, unknown>>(
        `${PENNYLANE_BASE}/quotes?limit=100`,
        { headers },
      ),
    ]);

    const invoiceItems = (inv.items ?? inv.customer_invoices ?? []) as Record<string, unknown>[];
    const quoteItems   = (q.items   ?? q.quotes             ?? []) as Record<string, unknown>[];

    return jsonResponse({
      last_invoice_number: maxDocNumber(invoiceItems.map(i => i.invoice_number as string)),
      last_quote_number:   maxDocNumber(quoteItems.map(x => x.quote_number as string)),
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      // Erreur Pennylane → on retourne null proprement, le front ne throw jamais
      return jsonResponse({ last_invoice_number: null, last_quote_number: null });
    }
    return jsonResponse({ last_invoice_number: null, last_quote_number: null });
  }
});
