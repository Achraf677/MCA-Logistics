// Edge Function `pennylane-invoice`
// Accepte { delivery_id } (1 livraison, rétrocompat assistant) OU { delivery_ids } (N livraisons, même client).
// Crée UNE facture Pennylane multi-lignes et propage pennylane_invoice_id + invoice_group_id à toutes.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import type { InvoiceLine } from '../_shared/pennylane.ts';
import {
  createCompanyCustomer,
  createDraftInvoice,
  finalizeInvoice,
  findCustomerByRef,
  pennylaneToken,
  vatRateCode,
} from '../_shared/pennylane.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Normalise body → liste d'ids (rétrocompat delivery_id seul) ─────────────
  let ids: string[];
  try {
    const body = await req.json();
    if (typeof body?.delivery_id === 'string' && body.delivery_id.length > 0) {
      ids = [body.delivery_id];
    } else if (Array.isArray(body?.delivery_ids) && body.delivery_ids.length > 0) {
      ids = (body.delivery_ids as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      );
    } else {
      ids = [];
    }
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  if (ids.length === 0) {
    return jsonResponse(
      { ok: false, error: 'delivery_id ou delivery_ids requis (liste non vide)' },
      400,
    );
  }

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const supabase = getServiceClient();

  // ── Charge toutes les livraisons en une requête ──────────────────────────────
  const { data: deliveries, error: dErr } = await supabase
    .from('deliveries')
    .select(
      'id, client_id, date, description, type, invoiced_at, ' +
        'amount_ht_cts, tva_cts, tva_rate, pennylane_invoice_id',
    )
    .in('id', ids);

  if (dErr) return jsonResponse({ ok: false, error: dErr.message }, 500);

  // ── Validations — aucun appel Pennylane si une seule échoue ─────────────────

  // Toutes existent
  if (!deliveries || deliveries.length !== ids.length) {
    const found = new Set((deliveries ?? []).map((d) => d.id));
    const missing = ids.filter((id) => !found.has(id));
    return jsonResponse(
      { ok: false, error: `livraison(s) introuvable(s) : ${missing.join(', ')}` },
      404,
    );
  }

  // Même client
  const uniqueClientIds = [...new Set(deliveries.map((d) => d.client_id))];
  if (uniqueClientIds.length > 1) {
    return jsonResponse(
      { ok: false, error: 'livraisons de clients différents — facturation groupée impossible' },
      422,
    );
  }

  // Aucune déjà synchro Pennylane
  const alreadySynced = deliveries.filter((d) => d.pennylane_invoice_id);
  if (alreadySynced.length > 0) {
    // Rétrocompat : 1 livraison déjà synchro → réponse silencieuse (assistant)
    if (ids.length === 1) return jsonResponse({ ok: true, alreadySynced: true });
    return jsonResponse(
      { ok: false, error: `déjà facturée(s) : ${alreadySynced.map((d) => d.id).join(', ')}` },
      422,
    );
  }

  // Montant > 0 et taux TVA standard pour chaque livraison
  interface ValidatedLine {
    id: string;
    amountHtCts: number;
    vatCode: string;
    label: string;
  }
  const validatedLines: ValidatedLine[] = [];

  for (const d of deliveries) {
    const amountHtCts = d.amount_ht_cts;
    if (amountHtCts == null || amountHtCts <= 0) {
      return jsonResponse(
        { ok: false, error: `montant manquant sur livraison ${d.id}` },
        422,
      );
    }
    const ratePct = d.tva_rate != null ? Number(d.tva_rate) : 20;
    const tvaCts = d.tva_cts ?? Math.round((amountHtCts * ratePct) / 100);
    const effectiveRatePct = amountHtCts > 0
      ? Math.round((tvaCts / amountHtCts) * 1000) / 10
      : ratePct;

    const vatCode = vatRateCode(effectiveRatePct);
    if (vatCode === null) {
      return jsonResponse({
        ok: false,
        error: `taux TVA non standard sur livraison ${d.id}`,
        details: { delivery_id: d.id, tva_rate_pct: effectiveRatePct, tva_cts: tvaCts, amount_ht_cts: amountHtCts },
      }, 422);
    }

    const label = (d.description?.trim() ||
      `Livraison ${d.type ?? ''} du ${d.date ?? ''}`.trim());

    validatedLines.push({ id: d.id, amountHtCts, vatCode, label });
  }

  // ── Client Pennylane (créé/récupéré une seule fois) ──────────────────────────
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, name, email, pennylane_id, address, postal_code, city, payment_terms')
    .eq('id', uniqueClientIds[0])
    .single();

  if (cErr || !client) return jsonResponse({ ok: false, error: 'client not found' }, 404);

  try {
    let pennylaneCustomerId = client.pennylane_id ? Number(client.pennylane_id) : null;

    if (!pennylaneCustomerId) {
      pennylaneCustomerId = await findCustomerByRef(token, client.id);
      if (!pennylaneCustomerId) {
        pennylaneCustomerId = await createCompanyCustomer(token, {
          name: client.name,
          emails: client.email ? [client.email] : [],
          external_reference: client.id,
          billing_address: {
            address: client.address ?? '',
            postal_code: client.postal_code ?? '',
            city: client.city ?? '',
            country_alpha2: 'FR',
          },
        });
      }
      await supabase
        .from('clients')
        .update({ pennylane_id: String(pennylaneCustomerId) })
        .eq('id', client.id);
    }

    // ── Date et échéance ─────────────────────────────────────────────────────
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const deadlineObj = new Date(`${invoiceDate}T00:00:00Z`);
    deadlineObj.setUTCDate(deadlineObj.getUTCDate() + (client.payment_terms ?? 30));
    const deadlineDate = deadlineObj.toISOString().slice(0, 10);

    // ── Lignes de facture : une par livraison ────────────────────────────────
    const invoiceLines: InvoiceLine[] = validatedLines.map((ln) => ({
      label: ln.label,
      quantity: 1,
      unit: 'piece',
      raw_currency_unit_price: centimesToEuros(ln.amountHtCts).toFixed(2),
      vat_rate: ln.vatCode,
    }));

    // ── Création brouillon + finalisation ────────────────────────────────────
    const draftInvoiceId = await createDraftInvoice(token, {
      customer_id: pennylaneCustomerId,
      date: invoiceDate,
      deadline: deadlineDate,
      invoice_lines: invoiceLines,
    });
    await finalizeInvoice(token, draftInvoiceId);

    // ── invoice_group_id uniquement si N > 1 ─────────────────────────────────
    const invoiceGroupId = ids.length > 1 ? crypto.randomUUID() : null;
    const now = new Date().toISOString();

    await supabase
      .from('deliveries')
      .update({
        pennylane_invoice_id: String(draftInvoiceId),
        invoice_group_id: invoiceGroupId,
        statut: 'facturee',
        invoiced_at: now,
        pennylane_synced_at: now,
        sync_pending: false,
        sync_error: null,
      })
      .in('id', ids);

    return jsonResponse({
      ok: true,
      data: {
        pennylane_invoice_id: String(draftInvoiceId),
        invoice_group_id: invoiceGroupId,
        count: ids.length,
      },
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
