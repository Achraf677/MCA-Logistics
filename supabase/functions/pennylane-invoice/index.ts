// Edge Function `pennylane-invoice`
// Appelée par le front à la transition livree → facturee avec { delivery_id }.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import { createCompanyCustomer, createDraftInvoice, finalizeInvoice, findCustomerByRef, vatRateCode } from '../_shared/pennylane.ts';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return optionsResponse();
  let deliveryId;
  try {
    const body = await req.json();
    deliveryId = body?.delivery_id;
  } catch  {
    return jsonResponse({
      ok: false,
      error: 'invalid JSON body'
    }, 400);
  }
  if (typeof deliveryId !== 'string' || deliveryId.length === 0) {
    return jsonResponse({
      ok: false,
      error: 'delivery_id required'
    }, 400);
  }
  const token = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!token) return jsonResponse({
    ok: false,
    error: 'missing PENNYLANE_API_TOKEN'
  }, 500);
  const supabase = getServiceClient();
  const { data: delivery, error: dErr } = await supabase.from('deliveries').select('id, client_id, date, description, type, invoiced_at, ' + 'amount_ht_cts, tva_cts, montant_ht_cts, tva_rate, pennylane_invoice_id').eq('id', deliveryId).single();
  if (dErr || !delivery) {
    return jsonResponse({
      ok: false,
      error: 'delivery not found'
    }, 404);
  }
  if (delivery.pennylane_invoice_id) {
    return jsonResponse({
      ok: true,
      alreadySynced: true
    });
  }
  const amountHtCts = delivery.amount_ht_cts ?? delivery.montant_ht_cts;
  if (amountHtCts == null || amountHtCts <= 0) {
    return jsonResponse({
      ok: false,
      error: 'missing amount on delivery'
    }, 422);
  }
  const ratePct = delivery.tva_rate != null ? Number(delivery.tva_rate) : 20;
  const tvaCts = delivery.tva_cts ?? Math.round(amountHtCts * ratePct / 100);
  // Taux cohérent avec tva_cts effectif (au cas où la TVA aurait été surchargée).
  const effectiveRatePct = amountHtCts > 0 ? Math.round(tvaCts / amountHtCts * 1000) / 10 : ratePct;
  // ── Garde-fou TVA : refuser un taux non standard AVANT tout appel Pennylane ──
  // (aucun client/facture créé si le taux ne mappe pas un code légal connu).
  const vatCode = vatRateCode(effectiveRatePct);
  if (vatCode === null) {
    return jsonResponse({
      ok: false,
      error: 'taux TVA non standard, code introuvable',
      details: {
        tva_rate_pct: effectiveRatePct,
        tva_cts: tvaCts,
        amount_ht_cts: amountHtCts
      }
    }, 422);
  }
  const { data: client, error: cErr } = await supabase.from('clients').select('id, name, email, pennylane_id, address, postal_code, city, payment_terms').eq('id', delivery.client_id).single();
  if (cErr || !client) {
    return jsonResponse({
      ok: false,
      error: 'client not found'
    }, 404);
  }
  try {
    let pennylaneCustomerId = client.pennylane_id ? Number(client.pennylane_id) : null;
    if (!pennylaneCustomerId) {
      pennylaneCustomerId = await findCustomerByRef(token, client.id);
      if (!pennylaneCustomerId) {
        pennylaneCustomerId = await createCompanyCustomer(token, {
          name: client.name,
          emails: client.email ? [
            client.email
          ] : [],
          external_reference: client.id,
          billing_address: {
            address: client.address ?? '',
            postal_code: client.postal_code ?? '',
            city: client.city ?? '',
            country_alpha2: 'FR'
          }
        });
      }
      await supabase.from('clients').update({
        pennylane_id: String(pennylaneCustomerId)
      }).eq('id', client.id);
    }
    const invoiceDate = (delivery.invoiced_at ?? delivery.date ?? new Date().toISOString()).slice(0, 10);
    // Échéance = date + délai de paiement client (jours), défaut 30.
    const deadline = new Date(`${invoiceDate}T00:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() + (client.payment_terms ?? 30));
    const deadlineDate = deadline.toISOString().slice(0, 10);
    const label = delivery.description?.trim() || `Livraison ${delivery.type ?? ''} du ${delivery.date ?? invoiceDate}`.trim();
    const draftInvoiceId = await createDraftInvoice(token, {
      customer_id: pennylaneCustomerId,
      date: invoiceDate,
      deadline: deadlineDate,
      invoice_lines: [
        {
          label,
          quantity: 1,
          unit: 'piece',
          raw_currency_unit_price: centimesToEuros(amountHtCts).toFixed(2),
          vat_rate: vatCode
        }
      ]
    });
    await finalizeInvoice(token, draftInvoiceId);
    await supabase.from('deliveries').update({
      pennylane_invoice_id: String(draftInvoiceId),
      pennylane_synced_at: new Date().toISOString(),
      sync_pending: false,
      sync_error: null
    }).eq('id', delivery.id);
    return jsonResponse({
      ok: true,
      data: {
        pennylane_invoice_id: String(draftInvoiceId)
      }
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({
        ok: false,
        error: err.message,
        status: err.status,
        body: err.responseBody
      }, 502);
    }
    return jsonResponse({
      ok: false,
      error: err.message
    }, 500);
  }
});
