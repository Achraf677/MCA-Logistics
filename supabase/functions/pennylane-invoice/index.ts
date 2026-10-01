// Edge Function `pennylane-invoice`
// Accepte { delivery_id } (1 livraison) OU { delivery_ids } (N livraisons, même client).
// Crée UNE facture Pennylane multi-lignes et propage pennylane_invoice_id + invoice_group_id à toutes.
//
// C'est ELLE qui passe les courses à `facturee`, et seulement une fois la
// facture créée et finalisée chez Pennylane. Le front n'écrit plus le statut
// avant l'appel : un refus de Pennylane laisse la course `livree`, avec la
// cause dans `sync_error` (course seule) et dans la réponse.
//
// Sécurité : service_role (RLS contournée) → contrôle explicite du JWT
// appelant : même société, et président ou droit `livraisons.livraisons`
// update (voir _shared/auth.ts).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import { computeDeadline } from '../_shared/paymentTerms.ts';
import { construireLignes, type CourseAFacturer, type LigneFacture } from '../_shared/lignesFacture.ts';
import type { InvoiceLine } from '../_shared/pennylane.ts';
import {
  createCompanyCustomer,
  createDraftInvoice,
  finalizeInvoice,
  findCustomerByRef,
  getInvoiceNumber,
  pennylaneToken,
  updateCompanyCustomerVat,
  VAT_CODE_AUTOLIQUIDATION,
  MENTION_AUTOLIQUIDATION,
} from '../_shared/pennylane.ts';

/** Détail lisible d'un refus Pennylane (` : …`), vide si rien d'exploitable. */
function detailPennylane(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body.trim() ? ` : ${body.trim().slice(0, 300)}` : '';
  if (typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  for (const k of ['error', 'message', 'detail']) {
    if (typeof b[k] === 'string' && (b[k] as string).trim()) return ` : ${(b[k] as string).trim().slice(0, 300)}`;
  }
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    return ` : ${b.errors.map((e) => typeof e === 'string' ? e : JSON.stringify(e)).join(' ; ').slice(0, 300)}`;
  }
  return ` : ${JSON.stringify(body).slice(0, 300)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Normalise body → liste d'ids (rétrocompat delivery_id seul) ─────────────
  // `invoice_date` et `deadline` (optionnels, AAAA-MM-JJ) forcent les dates au
  // lieu du jour courant + délai de paiement du client. Nécessaires pour refléter
  // une auto-facture (transport : le donneur d'ordre émet la facture pour nous,
  // à SES dates) — sinon la copie dans Pennylane ne correspond pas à l'original.
  let ids: string[];
  let invoiceDateOverride: string | null = null;
  let deadlineOverride: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.delivery_id === 'string' && body.delivery_id.length > 0) {
      ids = [body.delivery_id];
    } else if (Array.isArray(body?.delivery_ids) && body.delivery_ids.length > 0) {
      ids = [...new Set((body.delivery_ids as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      ))];
    } else {
      ids = [];
    }
    const isIsoDay = (v: unknown): v is string =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

    if (body?.invoice_date != null) {
      if (!isIsoDay(body.invoice_date)) {
        return jsonResponse({ ok: false, error: 'invoice_date invalide (attendu AAAA-MM-JJ)' }, 400);
      }
      invoiceDateOverride = body.invoice_date;
    }
    if (body?.deadline != null) {
      if (!isIsoDay(body.deadline)) {
        return jsonResponse({ ok: false, error: 'deadline invalide (attendu AAAA-MM-JJ)' }, 400);
      }
      deadlineOverride = body.deadline;
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

  const supabase = getServiceClient();

  // ── Qui appelle ? (avant toute lecture de données) ──────────────────────────
  const acces = await exigerPermission(req, supabase, 'livraisons.livraisons', 'update');
  if (!acces.ok) return acces.response;
  const companyId = acces.companyId;

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  // ── Charge toutes les livraisons en une requête ──────────────────────────────
  const { data: rows, error: dErr } = await supabase
    .from('deliveries')
    .select(
      'id, company_id, client_id, statut, date, description, reference_client, prestation, nb_colis, prix_unitaire_cts, type, amount_ht_cts, tva_cts, tva_rate, pennylane_invoice_id, extra_lines, autoliquidation',
    )
    .in('id', ids);

  if (dErr) return jsonResponse({ ok: false, error: dErr.message }, 500);

  // Une livraison d'une autre société est traitée comme introuvable (on ne
  // confirme même pas son existence).
  const deliveries = (rows ?? []).filter((d) => d.company_id === companyId);
  if (deliveries.length !== ids.length) {
    const found = new Set(deliveries.map((d) => d.id));
    const missing = ids.filter((id) => !found.has(id));
    return jsonResponse(
      { ok: false, error: `livraison(s) introuvable(s) : ${missing.join(', ')}` },
      404,
    );
  }

  const single = ids.length === 1;

  /**
   * Réponse d'échec. Pour une course SEULE, la cause est aussi écrite dans
   * `sync_error` : elle reste lisible dans la fiche après fermeture du toast.
   * Jamais sur une course qui porte déjà une facture.
   */
  const echec = async (status: number, body: Record<string, unknown>): Promise<Response> => {
    if (single && typeof body.error === 'string') {
      try {
        await supabase
          .from('deliveries')
          .update({ sync_error: body.error })
          .eq('id', ids[0])
          .is('pennylane_invoice_id', null);
      } catch { /* best-effort : la réponse porte déjà la cause */ }
    }
    return jsonResponse({ ok: false, ...body }, status);
  };

  // ── Validations — aucun appel Pennylane si une seule échoue ─────────────────

  // Aucune déjà synchro Pennylane
  const alreadySynced = deliveries.filter((d) => d.pennylane_invoice_id);
  if (alreadySynced.length > 0) {
    // Course seule déjà facturée → réponse silencieuse (idempotence).
    if (single) return jsonResponse({ ok: true, alreadySynced: true });
    return jsonResponse(
      { ok: false, error: `déjà facturée(s) : ${alreadySynced.map((d) => d.id).join(', ')}` },
      422,
    );
  }

  // Garde machine à états : seule une course LIVRÉE se facture.
  const nonLivrees = deliveries.filter((d) => d.statut !== 'livree');
  if (nonLivrees.length > 0) {
    const d = nonLivrees[0];
    const detail = d.statut === 'facturee'
      ? ' Si elle est restée « Facturée » sans facture, utilisez « Revenir à livrée » dans sa fiche.'
      : '';
    return jsonResponse({
      ok: false,
      error: `Seule une course livrée peut être facturée (course du ${d.date ?? '?'} au statut « ${d.statut} »).${detail}`,
    }, 409);
  }

  // Même client
  const uniqueClientIds = [...new Set(deliveries.map((d) => d.client_id))];
  if (uniqueClientIds.length > 1) {
    return jsonResponse(
      { ok: false, error: 'livraisons de clients différents — facturation groupée impossible' },
      422,
    );
  }

  // Lignes (principale + supplémentaires) — même règle que l'aperçu front.
  const validatedLines: LigneFacture[] = [];
  let factureAutoliquidee = false;
  for (const d of deliveries) {
    const r = construireLignes(d as unknown as CourseAFacturer, {
      codeAutoliquidation: VAT_CODE_AUTOLIQUIDATION,
      mentionAutoliquidation: MENTION_AUTOLIQUIDATION,
    });
    if (!r.ok) return await echec(422, { error: r.error, details: r.details });
    validatedLines.push(...r.lignes);
    if (d.autoliquidation === true) factureAutoliquidee = true;
  }

  // ── Client Pennylane (créé/récupéré une seule fois) ──────────────────────────
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, company_id, name, email, pennylane_id, address, postal_code, city, payment_terms, payment_terms_label, tva_intra')
    .eq('id', uniqueClientIds[0])
    .single();

  if (cErr || !client || client.company_id !== companyId) {
    return await echec(404, { error: 'Client de la course introuvable.' });
  }

  const tvaIntra = typeof client.tva_intra === 'string' && client.tva_intra.trim()
    ? client.tva_intra.replace(/\s+/g, '').toUpperCase()
    : null;

  let draftInvoiceId: number;
  let invoiceNumber: string | null;
  let invoiceDate: string;
  try {
    let pennylaneCustomerId = client.pennylane_id ? Number(client.pennylane_id) : null;

    if (!pennylaneCustomerId) {
      pennylaneCustomerId = await findCustomerByRef(token, client.id);
      if (!pennylaneCustomerId) {
        pennylaneCustomerId = await createCompanyCustomer(token, {
          name: client.name,
          emails: client.email ? [client.email] : [],
          external_reference: client.id,
          // Pas de colonne pays sur `clients` : FR par défaut (seul cas géré).
          billing_address: {
            address: client.address ?? '',
            postal_code: client.postal_code ?? '',
            city: client.city ?? '',
            country_alpha2: 'FR',
          },
          ...(tvaIntra ? { vat_number: tvaIntra } : {}),
        });
      } else if (factureAutoliquidee && tvaIntra) {
        // Client déjà connu de Pennylane : son n° de TVA doit figurer sur une
        // facture autoliquidée. Best-effort, ne bloque jamais la facture.
        try { await updateCompanyCustomerVat(token, pennylaneCustomerId, tvaIntra); } catch { /* ignoré */ }
      }
      await supabase
        .from('clients')
        .update({ pennylane_id: String(pennylaneCustomerId) })
        .eq('id', client.id);
    } else if (factureAutoliquidee && tvaIntra) {
      try { await updateCompanyCustomerVat(token, pennylaneCustomerId, tvaIntra); } catch { /* ignoré */ }
    }

    // ── Date et échéance ─────────────────────────────────────────────────────
    // payment_terms_label (select façon Pennylane) prime si renseigné — gère
    // notamment "30 jours fin de mois", indiscernable du seul entier payment_terms.
    invoiceDate = invoiceDateOverride ?? new Date().toISOString().slice(0, 10);
    const deadlineDate = deadlineOverride
      ?? computeDeadline(client.payment_terms_label, invoiceDate, client.payment_terms ?? 30);

    // ── Lignes de facture : une par livraison + N par ligne supplémentaire ───
    const invoiceLines: InvoiceLine[] = validatedLines.map((ln) => ({
      label: ln.label,
      quantity: ln.quantity,
      unit: 'piece',
      raw_currency_unit_price: centimesToEuros(ln.amountHtCts).toFixed(2),
      vat_rate: ln.vatCode,
    }));

    // ── Création brouillon + finalisation ────────────────────────────────────
    draftInvoiceId = await createDraftInvoice(token, {
      customer_id: pennylaneCustomerId,
      date: invoiceDate,
      deadline: deadlineDate,
      invoice_lines: invoiceLines,
    });
    await finalizeInvoice(token, draftInvoiceId);
    invoiceNumber = await getInvoiceNumber(token, draftInvoiceId);
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return await echec(502, {
        error: err.status
          ? `Pennylane a refusé la facture (HTTP ${err.status})${detailPennylane(err.responseBody)}`
          : `Pennylane injoignable : ${err.message}`,
        status: err.status,
        body: err.responseBody,
      });
    }
    return await echec(500, { error: (err as Error).message });
  }

  // ── À partir d'ici, la facture EXISTE chez Pennylane. ────────────────────────
  // Plus aucun `echec` : une course laissée non facturée serait refacturée au
  // prochain essai — donc un vrai doublon.

  // Garde-fou : numéro déjà utilisé. Pennylane numérote lui-même et peut
  // réattribuer un numéro existant (facture antidatée créée à la main). Le
  // contrôle ne doit JAMAIS faire échouer l'enregistrement.
  let numberConflict: string | null = null;
  if (invoiceNumber) {
    try {
      const { data: clash } = await supabase
        .from('deliveries')
        .select('pennylane_invoice_id')
        .eq('pennylane_invoice_number', invoiceNumber)
        .neq('pennylane_invoice_id', String(draftInvoiceId))
        .limit(1);
      if (clash && clash.length > 0) {
        numberConflict = `Numéro ${invoiceNumber} déjà porté par la facture Pennylane ` +
          `${clash[0].pennylane_invoice_id} — doublon à régler chez Pennylane.`;
      }
    } catch { /* contrôle best-effort */ }
  }

  // ── invoice_group_id uniquement si N > 1 ─────────────────────────────────
  const invoiceGroupId = ids.length > 1 ? crypto.randomUUID() : null;
  const now = new Date().toISOString();
  const miseAJour = {
    pennylane_invoice_id: String(draftInvoiceId),
    pennylane_invoice_number: invoiceNumber,
    invoice_group_id: invoiceGroupId,
    statut: 'facturee',
    invoiced_at: now,
    pennylane_synced_at: now,
    sync_pending: false,
    sync_error: numberConflict,
  };

  // Écriture vérifiée (2 essais) : toutes les courses doivent être à jour.
  let enregistrees = 0;
  let derniereErreur = '';
  for (let essai = 0; essai < 2 && enregistrees !== ids.length; essai++) {
    const { data: maj, error: uErr } = await supabase
      .from('deliveries')
      .update(miseAJour)
      .in('id', ids)
      .select('id');
    if (uErr) derniereErreur = uErr.message;
    else {
      enregistrees = maj?.length ?? 0;
      if (enregistrees !== ids.length) derniereErreur = `${enregistrees}/${ids.length} course(s) mises à jour`;
    }
  }
  if (enregistrees !== ids.length) {
    // Code dédié : le front réessaie l'écriture lui-même et, surtout, ne
    // lève PAS `sync_pending` (le rattrapage referait une facture).
    return jsonResponse({
      ok: false,
      code: 'enregistrement_echoue',
      error: `Facture Pennylane ${invoiceNumber ?? draftInvoiceId} créée, mais son enregistrement a échoué `
        + `(${derniereErreur}). Ne pas refacturer.`,
      pennylane_invoice_id: String(draftInvoiceId),
      pennylane_invoice_number: invoiceNumber,
      invoice_group_id: invoiceGroupId,
    }, 500);
  }

  return jsonResponse({
    ok: true,
    data: {
      pennylane_invoice_id: String(draftInvoiceId),
      pennylane_invoice_number: invoiceNumber,
      invoice_group_id: invoiceGroupId,
      invoice_date: invoiceDate,
      count: ids.length,
      number_conflict: numberConflict,
    },
  });
});
