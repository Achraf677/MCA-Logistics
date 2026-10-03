// Edge Function `pennylane-quote`
// Body : { action: 'create' | 'convert' | 'sync-number', quote_id: string }
// action 'create'      → crée le devis chez Pennylane, pose pennylane_quote_id + pennylane_quote_number + statut='envoye'.
// action 'convert'     → REFUSÉE depuis le lot U4 : « Facturer directement » crée la course du
//                        devis (livrée) et la facture par pennylane-invoice, qui passe le devis
//                        à 'facture' (une seule façon de facturer, suivie).
// action 'sync-number' → rattrapage : lit quote_number depuis Pennylane et le stocke.
//
// Contrôle d'accès (le service role contourne la RLS, on revérifie ici) :
//  - JWT de l'appelant obligatoire, société lue dans profiles ;
//  - le devis doit appartenir à cette société ;
//  - président, ou droit `livraisons.devis` : 'create' pour émettre le devis
//    ('create'), 'update' pour 'convert' et 'sync-number'.
// Envoi ('create') : verrou `quotes.envoi_verrou` (double clic = un seul devis chez
// Pennylane) ; un refus est écrit dans `quotes.sync_error` (effacé au succès).
// Toute écriture en base est vérifiée : si Pennylane a créé le document mais que
// la base n'a pas pu être mise à jour, on répond 500 avec l'id Pennylane (sinon
// un nouvel essai créerait un doublon chez Pennylane).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { AuthError, aLaPermission, lireAppelant } from '../_shared/auth.ts';
import type { Appelant, PermAction } from '../_shared/auth.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import { construireLignesDevis, type DevisAFacturer } from '../_shared/lignesFacture.ts';
import { tvaNormalisee } from '../_shared/clientPennylane.ts';
import type { InvoiceLine } from '../_shared/pennylane.ts';
import {
  assurerClientPennylane,
  createQuote,
  getQuoteNumber,
  pennylaneToken,
  VAT_CODE_AUTOLIQUIDATION,
  MENTION_AUTOLIQUIDATION,
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

  // Envoi en cours (verrou pris) : tout échec libère le verrou et laisse la cause
  // lisible sur le devis.
  let verrouDevis = false;
  const echecEnvoi = async (status: number, body: Record<string, unknown>): Promise<Response> => {
    if (verrouDevis) {
      const { error: e } = await supabase.from('quotes')
        .update({ envoi_verrou: null, sync_error: typeof body.error === 'string' ? body.error : 'envoi refusé' })
        .eq('id', quote_id).eq('company_id', companyId).is('pennylane_quote_id', null);
      if (e) console.error('pennylane-quote: verrou non libéré', quote_id, e.message);
    }
    return jsonResponse({ ok: false, ...body }, status);
  };

  try {
    // ── Action : create ───────────────────────────────────────────────────────
    if (action === 'create') {

      // 1. Charger le devis (fiche de prix comprise : mêmes lignes qu'à l'écran)
      const { data: quote, error: qErr } = await supabase
        .from('quotes')
        .select('id, client_id, date, valid_until, description, reference_client, prestation, '
          + 'quantite, prix_unitaire_cts, extra_lines, autoliquidation, '
          + 'amount_ht_cts, tva_rate, tva_cts, pennylane_quote_id')
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (qErr || !quote) return jsonResponse({ ok: false, error: 'devis introuvable' }, 404);

      // 2. Idempotence
      if (quote.pennylane_quote_id) return jsonResponse({ ok: true, alreadySynced: true });

      // 2 bis. Verrou : un seul envoi à la fois (pris atomiquement, expire après 5 min).
      const verrouExpire = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: pris, error: vErr } = await supabase
        .from('quotes')
        .update({ envoi_verrou: new Date().toISOString() })
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .is('pennylane_quote_id', null)
        .or(`envoi_verrou.is.null,envoi_verrou.lt.${verrouExpire}`)
        .select('id');
      if (vErr) return jsonResponse({ ok: false, error: vErr.message }, 500);
      if (!pris || pris.length === 0) {
        return jsonResponse({ ok: false, error: 'Envoi déjà en cours pour ce devis : patientez quelques secondes puis rechargez.' }, 409);
      }
      verrouDevis = true;

      // 3. Lignes : même règle que la facture (_shared/lignesFacture#construireLignesDevis) —
      //    quantité × prix unitaire, suppléments, codes TVA légaux, autoliquidation + mention.
      const lignes = construireLignesDevis(quote as unknown as DevisAFacturer, {
        codeAutoliquidation: VAT_CODE_AUTOLIQUIDATION,
        mentionAutoliquidation: MENTION_AUTOLIQUIDATION,
      });
      if (!lignes.ok) return await echecEnvoi(422, { error: lignes.error, details: lignes.details });

      // 4. Client Pennylane : même règle que la facture (pays, n° TVA de la fiche).
      const { data: client, error: cErr } = await supabase
        .from('clients')
        .select('id, name, email, pennylane_id, address, postal_code, city, pays, tva_intra')
        .eq('id', quote.client_id)
        .eq('company_id', companyId)
        .maybeSingle();

      if (cErr || !client) return await echecEnvoi(404, { error: 'client introuvable' });

      // Même garde que la facture : autoliquidation sans n° de TVA = document non conforme.
      if (quote.autoliquidation === true && !tvaNormalisee(client.tva_intra)) {
        return await echecEnvoi(422, {
          error: `Autoliquidation sans n° de TVA intracommunautaire pour ${client.name} : `
            + 'renseignez-le dans la fiche client, puis renvoyez le devis.',
        });
      }

      const pl = await assurerClientPennylane(token, client);
      const pennylaneCustomerId = pl.id;
      if (pl.aEnregistrer) {
        const { error: clErr } = await supabase
          .from('clients')
          .update({ pennylane_id: String(pennylaneCustomerId) })
          .eq('id', client.id);
        // Non bloquant : findCustomerByRef le retrouvera au prochain envoi.
        if (clErr) console.error('pennylane-quote: pennylane_id client non enregistré', client.id, clErr.message);
      }

      // 5. Lignes Pennylane (HT unitaire en euros)
      const invoiceLines: InvoiceLine[] = lignes.lignes.map((ln) => ({
        label: ln.label,
        quantity: ln.quantity,
        unit: 'piece',
        raw_currency_unit_price: centimesToEuros(ln.amountHtCts).toFixed(2),
        vat_rate: ln.vatCode,
      }));

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
          envoi_verrou: null,
          sync_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quote_id)
        .eq('company_id', companyId)
        .select('id');
      if (majQErr || !majQ || majQ.length === 0) {
        // Verrou GARDÉ : le devis existe chez Pennylane, un nouvel envoi ferait un doublon.
        verrouDevis = false;
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

    // ── Action : convert (refusée depuis le lot U4) ─────────────────────────────
    // La facture d'un devis passe par sa course (créée « livrée ») et pennylane-invoice :
    // date de Paris, échéance plafonnée, verrou, suivi du paiement et des relances.
    return jsonResponse({
      ok: false,
      error: 'Facturation directe : utilisez « Facturer directement » sur le devis (la course est créée puis facturée).',
    }, 410);

  } catch (err) {
    if (err instanceof ExternalApiError) {
      return await echecEnvoi(502, {
        error: `Pennylane a refusé l'envoi (${err.message})`, status: err.status, body: err.responseBody,
      });
    }
    return await echecEnvoi(500, { error: (err as Error).message });
  }
});
