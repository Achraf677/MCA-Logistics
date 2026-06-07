// Edge Function `qonto-sync` — ingestion Qonto EN LECTURE SEULE.
// Pour chaque compte bancaire Qonto :
//   - insère un snapshot de solde dans treasury_snapshots (1 ligne/compte/run) ;
//   - upsert les transactions dans qonto_transactions (idempotent sur qonto_id).
// Ne touche JAMAIS deliveries ni payments : le rapprochement est une étape
// ultérieure et distincte. Les secrets Qonto ne sont ni loggués ni renvoyés.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { getOrganization, listTransactions } from '../_shared/qonto.ts';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return optionsResponse();
  // ── Secrets Qonto (jamais loggués) ──────────────────────────────────────────
  const slug = Deno.env.get('QONTO_SLUG');
  const secret = Deno.env.get('QONTO_SECRET_KEY');
  if (!slug || !secret) {
    return jsonResponse({
      ok: false,
      error: 'missing QONTO_SLUG or QONTO_SECRET_KEY'
    }, 500);
  }
  const supabase = getServiceClient();
  // ── Mono-société : tout est rattaché à la première company ──────────────────
  const { data: company, error: cErr } = await supabase.from('companies').select('id').limit(1).single();
  if (cErr || !company) {
    return jsonResponse({
      ok: false,
      error: 'company not found'
    }, 404);
  }
  const companyId = company.id;
  try {
    const bankAccounts = await getOrganization(slug, secret);
    let snapshots = 0;
    let transactionsUpserted = 0;
    let balanceCts = 0;
    for (const account of bankAccounts){
      // ── Snapshot de trésorerie (1 ligne par compte par run) ──────────────────
      const { error: sErr } = await supabase.from('treasury_snapshots').insert({
        company_id: companyId,
        balance_cts: account.balance_cents,
        authorized_balance_cts: account.authorized_balance_cents,
        iban: account.iban,
        source: 'qonto'
      });
      if (sErr) return jsonResponse({
        ok: false,
        error: sErr.message
      }, 500);
      snapshots += 1;
      balanceCts += account.balance_cents;
      // ── Transactions : upsert idempotent sur qonto_id (jamais de payment_id) ──
      const transactions = await listTransactions(slug, secret, account.id);
      if (transactions.length > 0) {
        const rows = transactions.map((t)=>({
            company_id: companyId,
            qonto_id: t.id,
            label: t.label,
            amount_cts: t.amount_cents,
            side: t.side,
            operation_type: t.operation_type,
            settled_at: t.settled_at,
            raw_data: t
          }));
        const { error: tErr } = await supabase.from('qonto_transactions').upsert(rows, {
          onConflict: 'qonto_id',
          ignoreDuplicates: true
        });
        if (tErr) return jsonResponse({
          ok: false,
          error: tErr.message
        }, 500);
        transactionsUpserted += rows.length;
      }
    }
    return jsonResponse({
      ok: true,
      data: {
        snapshots,
        transactions_upserted: transactionsUpserted,
        balance_cts: balanceCts
      }
    });
  } catch (err) {
    // Erreur API/réseau Qonto : on remonte le body brut pour ajuster (502).
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
