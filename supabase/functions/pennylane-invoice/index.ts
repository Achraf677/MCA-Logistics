// Edge Function `pennylane-invoice`
// Appelée par le front à la transition livree → facturee avec { delivery_id }.
// Crée (ou réutilise) le client Pennylane, émet une facture brouillon depuis les
// données de la livraison (source de vérité), la finalise, puis stocke la référence.
// Idempotent : si pennylane_invoice_id est déjà présent, court-circuit.
// Le token Pennylane n'est jamais loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import {
  createCompanyCustomer,
  createDraftInvoice,
  finalizeInvoice,
  findCustomerByRef,
  vatRateCode,
} from '../_shared/pennylane.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Body : delivery_id obligatoire ──────────────────────────────────────────
  let deliveryId: unknown;
  try {
    const body = await req.json();
    deliveryId = body?.delivery_id;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (typeof deliveryId !== 'string' || deliveryId.length === 0) {
    return jsonResponse({ ok: false, error: 'delivery_id required' }, 400);
  }

  const token = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!token) return jsonResponse({ ok: false, error: 'missing PENNYLANE_API_TOKEN' }, 500);

  const supabase = getServiceClient();

  // ── Charger la livraison ────────────────────────────────────────────────────
  const { data: delivery, error: dErr } = await supabase
    .from('deliveries')
    .select(
      'id, client_id, date, description, type, invoiced_at, ' +
        'amount_ht_cts, tva_cts, montant_ht_cts, tva_rate, pennylane_invoice_id',
    )
    .eq('id', deliveryId)
    .single();

  if (dErr || !delivery) {
    return jsonResponse({ ok: false, error: 'delivery not found' }, 404);
  }

  // Idempotence : facture déjà poussée → ne rien recréer.
  if (delivery.pennylane_invoice_id) {
    return jsonResponse({ ok: true, alreadySynced: true });
  }

  // ── Montants (source de vérité, en centimes ; fallback résidus legacy) ───────
  const amountHtCts = delivery.amount_ht_cts ?? delivery.montant_ht_cts;
  if (amountHtCts == null || amountHtCts <= 0) {
    return jsonResponse({ ok: false, error: 'missing amount on delivery' }, 422);
  }
  const ratePct = delivery.tva_rate != null ? Number(delivery.tva_rate) : 20;
  const tvaCts = delivery.tva_cts ?? Math.round((amountHtCts * ratePct) / 100);
  // Taux cohérent avec tva_cts effectif (au cas où la TVA aurait été surchargée).
  const effectiveRatePct = amountHtCts > 0
    ? Math.round((tvaCts / amountHtCts) * 1000) / 10
    : ratePct;

  // ── Charger le client lié ───────────────────────────────────────────────────
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, name, email, pennylane_id')
    .eq('id', delivery.client_id)
    .single();

  if (cErr || !client) {
    return jsonResponse({ ok: false, error: 'client not found' }, 404);
  }

  try {
    // ── Résoudre le client Pennylane ──────────────────────────────────────────
    let pennylaneCustomerId = client.pennylane_id ? Number(client.pennylane_id) : null;

    if (!pennylaneCustomerId) {
      pennylaneCustomerId = await findCustomerByRef(token, client.id);

      if (!pennylaneCustomerId) {
        pennylaneCustomerId = await createCompanyCustomer(token, {
          name: client.name,
          emails: client.email ? [client.email] : [],
          external_reference: client.id,
        });
      }

      // Stocker l'id Pennylane sur le client.
      await supabase
        .from('clients')
        .update({ pennylane_id: String(pennylaneCustomerId) })
        .eq('id', client.id);
    }

    // ── Créer la facture brouillon ────────────────────────────────────────────
    const invoiceDate = (delivery.invoiced_at ?? delivery.date ?? new Date().toISOString())
      .slice(0, 10);
    const label = delivery.description?.trim() ||
      `Livraison ${delivery.type ?? ''} du ${delivery.date ?? invoiceDate}`.trim();

    const draftInvoiceId = await createDraftInvoice(token, {
      customer_id: pennylaneCustomerId,
      date: invoiceDate,
      currency: 'EUR',
      invoice_lines: [
        {
          label,
          quantity: 1,
          unit: 'piece',
          raw_currency_unit_price: centimesToEuros(amountHtCts).toFixed(2),
          vat_rate: vatRateCode(effectiveRatePct),
        },
      ],
    });

    // ── Finaliser (uniquement si la création a réussi) ────────────────────────
    await finalizeInvoice(token, draftInvoiceId);

    // ── Écrire la référence sur la livraison ──────────────────────────────────
    await supabase
      .from('deliveries')
      .update({
        pennylane_invoice_id: String(draftInvoiceId),
        pennylane_synced_at: new Date().toISOString(),
        sync_pending: false,
        sync_error: null,
      })
      .eq('id', delivery.id);

    return jsonResponse({ ok: true, data: { pennylane_invoice_id: String(draftInvoiceId) } });
  } catch (err) {
    // Erreur API/réseau : on NE finalise pas, on remonte le body brut pour ajuster.
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
