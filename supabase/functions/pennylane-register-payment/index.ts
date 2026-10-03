// Edge Function `pennylane-register-payment`
// Enregistre le paiement d'une facture Pennylane quand une livraison passe à `payee`.
// Symétrique de `pennylane-invoice` (côté facturation), pour les encaissements
// hors rapprochement bancaire automatique (plateforme tierce, virement manuel…).
// N'écrit RIEN dans `deliveries` : `transitionDelivery` a déjà mis `statut='payee'`
// et `paid_at` avant l'appel. Cette fonction ne fait qu'informer Pennylane.
//
// Une FACTURE peut couvrir plusieurs courses (facturation groupée) et des
// lignes supplémentaires : c'est la facture ENTIÈRE qui est déclarée payée,
// une seule fois. Le reste dû est lu chez Pennylane (source de vérité) ; si la
// facture y est déjà soldée, rien n'est déclaré.
//
// Sécurité : même contrôle que pennylane-invoice (société + droit update).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { centimesToEuros } from '../_shared/money.ts';
import { jourParis, jourParisDe } from '../_shared/dates.ts';
import { totalTtcCourseCts } from '../_shared/totaux.ts';
import {
  getInvoicePaymentState,
  pennylaneToken,
  registerInvoicePayment,
} from '../_shared/pennylane.ts';

interface CourseFacturee {
  id: string;
  statut: string;
  paid_at: string | null;
  amount_ht_cts: number | null;
  tva_cts: number | null;
  amount_ttc_cts: number | null;
  autoliquidation: boolean | null;
  extra_lines: unknown;
}

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

  const supabase = getServiceClient();

  const acces = await exigerPermission(req, supabase, 'livraisons.livraisons', 'update');
  if (!acces.ok) return acces.response;
  const companyId = acces.companyId;

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const { data: delivery, error: dErr } = await supabase
    .from('deliveries')
    .select('id, company_id, statut, pennylane_invoice_id, invoice_group_id, paid_at')
    .eq('id', deliveryId)
    .maybeSingle();

  if (dErr || !delivery || delivery.company_id !== companyId) {
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
  const invoiceId = String(delivery.pennylane_invoice_id);

  // ── Toutes les courses de la même facture ────────────────────────────────
  let q = supabase
    .from('deliveries')
    .select('id, statut, paid_at, amount_ht_cts, tva_cts, amount_ttc_cts, autoliquidation, extra_lines')
    .eq('company_id', companyId);
  q = delivery.invoice_group_id
    ? q.or(`pennylane_invoice_id.eq.${invoiceId},invoice_group_id.eq.${delivery.invoice_group_id}`)
    : q.eq('pennylane_invoice_id', invoiceId);
  const { data: soeurs, error: sErr } = await q;
  if (sErr) return jsonResponse({ ok: false, error: sErr.message }, 500);
  const courses = (soeurs ?? []) as CourseFacturee[];

  // ── Reste dû chez Pennylane (source de vérité) ───────────────────────────
  let etat: { paid: boolean | null; remainingEuros: number | null };
  try {
    etat = await getInvoicePaymentState(token, invoiceId);
  } catch (err) {
    // État inconnu → on ne déclare RIEN : mieux vaut un paiement à déclarer à
    // la main qu'un paiement déclaré deux fois.
    const status = err instanceof ExternalApiError ? err.status : undefined;
    return jsonResponse({
      ok: false,
      error: `Lecture de la facture Pennylane impossible : ${(err as Error).message}`,
      status,
    }, 502);
  }

  if (etat.paid === true || (etat.remainingEuros != null && etat.remainingEuros <= 0)) {
    return jsonResponse({ ok: true, data: { skipped: 'déjà réglée chez Pennylane', invoice_id: invoiceId } });
  }

  let amountEuros: number;
  if (etat.remainingEuros != null) {
    amountEuros = Math.round(etat.remainingEuros * 100) / 100;
  } else {
    // Pennylane ne dit pas ce qui reste dû : on ne déclare que si aucune
    // autre course de la facture n'était déjà payée (sinon elle l'a été).
    const autrePayee = courses.some((c) => c.id !== deliveryId && c.statut === 'payee'
      && c.paid_at && delivery.paid_at && c.paid_at < delivery.paid_at);
    if (autrePayee) {
      return jsonResponse({ ok: true, data: { skipped: 'paiement déjà déclaré pour cette facture', invoice_id: invoiceId } });
    }
    // TTC dû = même règle qu'à l'écran (_shared/totaux, miroir de deliveryTotalTtcCts).
    const totaux = courses.map(totalTtcCourseCts);
    if (totaux.length === 0 || totaux.some((t) => t == null)) {
      return jsonResponse({ ok: false, error: 'Montant de la facture inconnu : paiement à déclarer dans Pennylane.' }, 422);
    }
    const totalCts = (totaux as number[]).reduce((s, t) => s + t, 0);
    if (totalCts <= 0) {
      return jsonResponse({ ok: false, error: 'Montant de la facture nul : rien à déclarer.' }, 422);
    }
    amountEuros = centimesToEuros(totalCts);
  }

  // Jour du paiement à PARIS (un paiement saisi à 1 h du matin n'est pas daté de la veille).
  const paidAt = jourParisDe(delivery.paid_at as string | null) ?? jourParis();

  try {
    await registerInvoicePayment(token, invoiceId, amountEuros, paidAt);
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
      invoice_id: invoiceId,
      amount: amountEuros,
      paid_at: paidAt,
      courses: courses.length,
    },
  });
});
