// Edge Function `pennylane-quote`
// Body : { action: 'create' | 'convert' | 'sync-number', quote_id: string }
// action 'create'      → crée le devis chez Pennylane, pose pennylane_quote_id + pennylane_quote_number + statut='envoye'.
// action 'convert'     → convertit le devis Pennylane en facture finalisée, pose pennylane_invoice_id + statut='facture'.
// action 'sync-number' → rattrapage : lit quote_number depuis Pennylane et le stocke.
//
// Contrôle d'accès (le service role contourne la RLS, on revérifie ici) :
//  - JWT de l'appelant obligatoire, société lue dans profiles ;
//  - le devis doit appartenir à cette société ;
//  - président, ou droit `livraisons.devis` : 'create' pour émettre le devis
//    ('create'), 'update' pour 'convert' et 'sync-number'.
// 'convert' n'est accepté que si le devis est au statut 'accepte'.
// Toute écriture en base est vérifiée : si Pennylane a créé le document mais que
// la base n'a pas pu être mise à jour, on répond 500 avec l'id Pennylane (sinon
// un nouvel essai créerait un doublon chez Pennylane).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { AuthError, aLaPermission, lireAppelant } from '../_shared/auth.ts';
import type { Appelant, PermAction } from '../_shared/auth.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import type { InvoiceLine } from '../_shared/pennylane.ts';
import {
  createCompanyCustomer,
  createInvoiceFromQuote,
  createQuote,
  findCustomerByRef,
  getQuoteNumber,
  pennylaneToken,
  vatRateCode,
} from '../_shared/pennylane.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Parse body ───────────────────────────────────────────────────────────────
  let action: string;
  let quote_id: string;
  try {
    const body = await req.json();
    action = body?.action ?? '';
    quote_id = body?.quote_id ?? '';
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  if (!quote_id) return jsonResponse({ ok: false, error: 'quote_id requis' }, 400);
  if (action !== 'create' && action !== 'convert' && action !== 'sync-number') {
    return jsonResponse({ ok: false, error: "action doit être 'create', 'convert' ou 'sync-number'" }, 400);
  }

  // ── Contrôle d'accès ─────────────────────────────────────────────────────────
  let appelant: Appelant;
  try {
    appelant = await lireAppelant(req);
  } catch (err) {
    if (err instanceof AuthError) return jsonResponse({ ok: false, error: err.message }, err.status);
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
  const droitRequis: PermAction = action === 'create' ? 'create' : 'update';
  if (!(await aLaPermission(appelant, 'livraisons.devis', droitRequis))) {
    return jsonResponse({ ok: false, error: `droit insuffisant (livraisons.devis / ${droitRequis})` }, 403);
  }
  const supabase = appelant.service;
  const companyId = appelant.companyId;

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  try {
    // ── Action : create ───────────────────────────────────────────────────────
    if (action === 'create') {

      // 1. Charger le devis
      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .select('id, client_id, date, valid_until, description, amount_ht_cts, tva_rate, tva_cts, pennylane_quote_id')
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (qErr || !quote) return jsonResponse({ ok: false, error: 'devis introuvable' }, 404);

      // 2. Idempotence
      if (quote.pennylane_quote_id) return jsonResponse({ ok: true, alreadySynced: true });

      // 3. Valider le montant et calculer le taux TVA effectif
      const amountHtCts: number = quote.amount_ht_cts;
      if (!amountHtCts || amountHtCts <= 0) {
        return jsonResponse({ ok: false, error: 'montant HT requis et > 0' }, 422);
      }
      const ratePct = quote.tva_rate != null ? Number(quote.tva_rate) : 20;
      const tvaCts = quote.tva_cts ?? Math.round((amountHtCts * ratePct) / 100);
      const effectiveRate = Math.round((tvaCts / amountHtCts) * 1000) / 10;
      const vatCode = vatRateCode(effectiveRate);
      if (vatCode === null) {
        return jsonResponse({
          ok: false,
          error: 'taux TVA non standard',
          details: { tva_rate_pct: effectiveRate, tva_cts: tvaCts, amount_ht_cts: amountHtCts },
        }, 422);
      }

      // 4. Charger le client et récupérer/créer le customer Pennylane
      const { data: client, error: cErr } = await supabase
        .from('clients')
        .select('id, name, email, pennylane_id, address, postal_code, city')
        .eq('id', quote.client_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (cErr || !client) return jsonResponse({ ok: false, error: 'client introuvable' }, 404);

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
        const { error: clErr } = await supabase
          .from('clients')
          .update({ pennylane_id: String(pennylaneCustomerId) })
          .eq('id', client.id);
        // Non bloquant : findCustomerByRef le retrouvera au prochain envoi.
        if (clErr) console.error('pennylane-quote: pennylane_id client non enregistré', client.id, clErr.message);
      }

      // 5. Ligne unique du devis
      const invoiceLines: InvoiceLine[] = [{
        label: quote.description?.trim() || `Devis du ${quote.date ?? ''}`,
        quantity: 1,
        unit: 'piece',
        raw_currency_unit_price: centimesToEuros(amountHtCts).toFixed(2),
        vat_rate: vatCode,
      }];

      // 6. Date et échéance (date + 30 j si valid_until absent)
      const quoteDate: string = quote.date;
      let deadline: string = quote.valid_until ?? '';
      if (!deadline) {
        const d = new Date(`${quoteDate}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 30);
        deadline = d.toISOString().slice(0, 10);
      }

      // 7. Créer le devis chez Pennylane
      const { id: pennylaneQuoteId, quote_number } = await createQuote(token, {
        customer_id: pennylaneCustomerId,
        date: quoteDate,
        deadline,
        invoice_lines: invoiceLines,
      });

      // 8. Persister (vérifié : sinon le devis serait renvoyé en double au prochain clic)
      const { data: majQ, error: majQErr } = await supabase
        .from('quotes')
        .update({
          pennylane_quote_id: String(pennylaneQuoteId),
          pennylane_quote_number: quote_number,
          statut: 'envoye',
          updated_at: new Date().toISOString(),
        })
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .select('id');
      if (majQErr || !majQ || majQ.length === 0) {
        return jsonResponse({
          ok: false,
          error: 'devis créé chez Pennylane mais NON enregistré en base : ne pas renvoyer, prévenir l\'administrateur',
          details: { pennylane_quote_id: String(pennylaneQuoteId), pennylane_quote_number: quote_number, db_error: majQErr?.message ?? '0 ligne mise à jour' },
        }, 500);
      }

      return jsonResponse({ ok: true, data: { pennylane_quote_id: String(pennylaneQuoteId), pennylane_quote_number: quote_number } });
    }

    // ── Action : sync-number ─────────────────────────────────────────────────
    if (action === 'sync-number') {
      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .select('id, pennylane_quote_id')
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (qErr || !quote) return jsonResponse({ ok: false, error: 'devis introuvable' }, 404);
      if (!quote.pennylane_quote_id) {
        return jsonResponse({ ok: false, error: "devis non encore envoyé à Pennylane" }, 422);
      }

      const pennylaneQuoteNumber = await getQuoteNumber(token, Number(quote.pennylane_quote_id));
      if (pennylaneQuoteNumber) {
        const { data: majN, error: majNErr } = await supabase
          .from('quotes')
          .update({ pennylane_quote_number: pennylaneQuoteNumber })
          .eq('id', quote_id)
          .eq('company_id', companyId)
          .select('id');
        if (majNErr || !majN || majN.length === 0) {
          return jsonResponse({ ok: false, error: 'numéro lu chez Pennylane mais non enregistré en base', details: { pennylane_quote_number: pennylaneQuoteNumber, db_error: majNErr?.message ?? '0 ligne mise à jour' } }, 500);
        }
      }

      return jsonResponse({ ok: true, data: { pennylane_quote_number: pennylaneQuoteNumber } });
    }

    // ── Action : convert ──────────────────────────────────────────────────────
    // 1. Charger le devis (champs minimaux)
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('id, pennylane_quote_id, pennylane_invoice_id, statut')
      .eq('id', quote_id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (qErr || !quote) return jsonResponse({ ok: false, error: 'devis introuvable' }, 404);

    // 2. Vérifier que le devis existe chez Pennylane
    if (!quote.pennylane_quote_id) {
      return jsonResponse({ ok: false, error: "créer le devis chez Pennylane d'abord" }, 422);
    }

    // 3. Idempotence
    if (quote.pennylane_invoice_id) return jsonResponse({ ok: true, alreadySynced: true });

    // 3 bis. Seul un devis accepté peut devenir une facture finalisée
    if (quote.statut !== 'accepte') {
      return jsonResponse({ ok: false, error: `seul un devis accepté peut être facturé (statut : ${quote.statut})` }, 409);
    }

    // 4. Convertir en facture finalisée
    const pennylaneInvoiceId = await createInvoiceFromQuote(token, Number(quote.pennylane_quote_id));

    // 5. Persister (vérifié : sinon un nouveau clic émettrait une 2e facture)
    const { data: majF, error: majFErr } = await supabase
      .from('quotes')
      .update({
        pennylane_invoice_id: String(pennylaneInvoiceId),
        statut: 'facture',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote_id)
      .eq('company_id', companyId)
      .select('id');
    if (majFErr || !majF || majF.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'facture émise chez Pennylane mais NON enregistrée en base : ne pas refacturer, prévenir l\'administrateur',
        details: { pennylane_invoice_id: String(pennylaneInvoiceId), db_error: majFErr?.message ?? '0 ligne mise à jour' },
      }, 500);
    }

    return jsonResponse({ ok: true, data: { pennylane_invoice_id: String(pennylaneInvoiceId) } });

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
