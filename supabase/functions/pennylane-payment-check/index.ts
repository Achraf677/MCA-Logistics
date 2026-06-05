// Edge Function `pennylane-payment-check`
// Marque `payee` les livraisons dont la facture Pennylane est rapprochée à un paiement.
// On n'interroge PAS Qonto : Pennylane (relié à Qonto) réconcilie automatiquement ;
// on lit le rapprochement côté Pennylane via GET /customer_invoices/{id}/matched_transactions.
// Règle v1 : liste de transactions rapprochées non vide ⇒ facture payée.
// N'écrit RIEN chez Pennylane et ne touche AUCUNE autre table que `deliveries`.
// Le token Pennylane n'est jamais loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { getMatchedTransactions } from '../_shared/pennylane.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const token = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!token) return jsonResponse({ ok: false, error: 'missing PENNYLANE_API_TOKEN' }, 500);

  const supabase = getServiceClient();

  // ── Livraisons facturées avec une référence Pennylane ─────────────────────────
  const { data: deliveries, error: dErr } = await supabase
    .from('deliveries')
    .select('id, pennylane_invoice_id')
    .eq('statut', 'facturee')
    .not('pennylane_invoice_id', 'is', null);

  if (dErr) {
    return jsonResponse({ ok: false, error: dErr.message }, 500);
  }

  let markedPayee = 0;

  try {
    for (const delivery of deliveries ?? []) {
      const matched = await getMatchedTransactions(token, delivery.pennylane_invoice_id);
      if (matched.length === 0) continue;

      // Garde-fou idempotent : on ne bascule que depuis `facturee`.
      const { error: uErr } = await supabase
        .from('deliveries')
        .update({ statut: 'payee', paid_at: new Date().toISOString() })
        .eq('id', delivery.id)
        .eq('statut', 'facturee');

      if (uErr) {
        return jsonResponse({ ok: false, error: uErr.message }, 500);
      }
      markedPayee++;
    }
  } catch (err) {
    // Erreur API/réseau Pennylane : on remonte le body brut pour ajuster, en 502.
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }

  const checked = deliveries?.length ?? 0;
  return jsonResponse({
    ok: true,
    data: { checked, marked_payee: markedPayee, still_unpaid: checked - markedPayee },
  });
});
