// Edge Function `pennylane-payment-check`
// Aligne les livraisons facturées sur l'état réel de leur facture Pennylane :
// - facture annulée par un avoir  → livraison `annulee` (sort de l'encours et du CA) ;
// - facture rapprochée à un paiement → livraison `payee`.
// Gère les factures groupées : un seul UPDATE par invoice_id passe TOUT le groupe d'un coup.
// N'écrit RIEN chez Pennylane et ne touche AUCUNE autre table que `deliveries`.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';

/** Règle v1 : liste de transactions rapprochées non vide ⇒ facture payée. */
async function isInvoicePaid(token: string, invoiceId: string): Promise<boolean> {
  const data = await fetchJson<Record<string, unknown>>(
    `${PENNYLANE_BASE}/customer_invoices/${invoiceId}/matched_transactions`,
    { headers: pennylaneHeaders(token) },
  );
  const items = (
    data.matched_transactions ?? data.items ?? (Array.isArray(data) ? data : [])
  ) as unknown[];
  return items.length > 0;
}

/** Numéro + statut en un seul appel. Null si la facture est illisible (ex. supprimée). */
async function fetchInvoice(
  token: string,
  invoiceId: string,
): Promise<{ invoice_number: string | null; status: string | null } | null> {
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `${PENNYLANE_BASE}/customer_invoices/${invoiceId}`,
      { headers: pennylaneHeaders(token) },
    );
    const inv = (data.invoice ?? data.customer_invoice ?? data) as Record<string, unknown>;
    return {
      invoice_number: (inv.invoice_number as string) ?? null,
      status: (inv.status as string) ?? null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const supabase = getServiceClient();

  // ── Livraisons facturées avec une référence Pennylane ─────────────────────────
  const { data: deliveries, error: dErr } = await supabase
    .from('deliveries')
    .select('id, pennylane_invoice_id, pennylane_invoice_number')
    .eq('statut', 'facturee')
    .not('pennylane_invoice_id', 'is', null);

  if (dErr) return jsonResponse({ ok: false, error: dErr.message }, 500);

  const deliveryList = deliveries ?? [];

  // Déduplique par invoice_id : une facture groupée = N livraisons, 1 seul appel Pennylane.
  const uniqueInvoiceIds = [...new Set(deliveryList.map((d) => d.pennylane_invoice_id as string))];

  let markedPayee = 0;
  let markedAnnulee = 0;

  try {
    for (const invoiceId of uniqueInvoiceIds) {
      const invoice = await fetchInvoice(token, invoiceId);

      // ── Rattrapage invoice_number manquant (coût nul : déjà lu ci-dessus) ─────
      const needsNumber = deliveryList.some(
        (d) => d.pennylane_invoice_id === invoiceId && !d.pennylane_invoice_number,
      );
      if (needsNumber && invoice?.invoice_number) {
        await supabase
          .from('deliveries')
          .update({ pennylane_invoice_number: invoice.invoice_number })
          .eq('pennylane_invoice_id', invoiceId);
      }

      // ── Facture annulée par un avoir ─────────────────────────────────────────
      // Testé AVANT le paiement : une facture soldée par un avoir peut porter
      // `paid: true` chez Pennylane, ce qui la ferait basculer à tort en `payee`.
      if (invoice?.status === 'cancelled') {
        const { error: cErr } = await supabase
          .from('deliveries')
          .update({ statut: 'annulee' })
          .eq('pennylane_invoice_id', invoiceId)
          .eq('statut', 'facturee');

        if (cErr) return jsonResponse({ ok: false, error: cErr.message }, 500);

        markedAnnulee += deliveryList.filter((d) => d.pennylane_invoice_id === invoiceId).length;
        continue;
      }

      const paid = await isInvoicePaid(token, invoiceId);
      if (!paid) continue;

      // Garde-fou idempotent : ne bascule que les livraisons encore en `facturee`.
      // Un seul UPDATE couvre tout le groupe (invoice_group_id partagé → même invoice_id).
      const { error: uErr } = await supabase
        .from('deliveries')
        .update({ statut: 'payee', paid_at: new Date().toISOString() })
        .eq('pennylane_invoice_id', invoiceId)
        .eq('statut', 'facturee');

      if (uErr) return jsonResponse({ ok: false, error: uErr.message }, 500);

      markedPayee += deliveryList.filter((d) => d.pennylane_invoice_id === invoiceId).length;
    }
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }

  const checked = deliveryList.length;
  return jsonResponse({
    ok: true,
    data: {
      checked,
      marked_payee: markedPayee,
      marked_annulee: markedAnnulee,
      still_unpaid: checked - markedPayee - markedAnnulee,
    },
  });
});
