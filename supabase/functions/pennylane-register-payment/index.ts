// Edge Function `pennylane-register-payment`
// Enregistre le paiement d'une facture Pennylane quand une livraison passe à `payee`.
// Symétrique de `pennylane-invoice` (côté facturation), pour les encaissements
// hors rapprochement bancaire automatique (plateforme tierce, virement manuel…).
// N'écrit RIEN dans `deliveries` : `transitionDelivery` a déjà mis `statut='payee'`
// et `paid_at` avant l'appel. Cette fonction ne fait qu'informer Pennylane.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import { pennylaneToken, registerInvoicePayment } from '../_shared/pennylane.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let deliveryId: string;
  try {
    const body = await req.json();
    if (typeof body?.delivery_id !== 'string' || body.delivery_id.length === 0) {
      return jsonResponse({ ok: false, error: 'delivery_id requis' }, 400);
    }
    deliveryId = body.delivery_id;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const supabase = getServiceClient();

  const { data: delivery, error: dErr } = await supabase
    .from('deliveries')
    .select('id, statut, pennylane_invoice_id, amount_ttc_cts, paid_at')
    .eq('id', deliveryId)
    .single();

  if (dErr || !delivery) {
    return jsonResponse({ ok: false, error: `livraison introuvable : ${deliveryId}` }, 404);
  }

  if (delivery.statut !== 'payee') {
    return jsonResponse(
      { ok: false, error: `livraison au statut ${delivery.statut}, attendu payee` },
      409,
    );
  }

  // Cas d'une livraison payée sans facture Pennylane (saut direct payee ou
  // facturation restée en sync_pending) — rien à pousser, retour ok.
  if (!delivery.pennylane_invoice_id) {
    return jsonResponse({ ok: true, data: { skipped: 'no pennylane_invoice_id' } });
  }

  const paidAt = (delivery.paid_at as string | null)?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10);
  const amountEuros = centimesToEuros(delivery.amount_ttc_cts as number);

  try {
    await registerInvoicePayment(
      token,
      delivery.pennylane_invoice_id as string,
      amountEuros,
      paidAt,
    );
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }

  return jsonResponse({
    ok: true,
    data: {
      invoice_id: delivery.pennylane_invoice_id,
      amount: amountEuros,
      paid_at: paidAt,
    },
  });
});
