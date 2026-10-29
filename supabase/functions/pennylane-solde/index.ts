// Edge Function `pennylane-solde` — solde du compte pro Pennylane, EN LECTURE SEULE.
// GET /bank_accounts (Pennylane V2) → 1 ligne par compte dans treasury_snapshots (source = 'pennylane').
// Les opérations du compte Swan sont aussi importées dans qonto_transactions (source = 'swan', qonto_id préfixé 'swan:').
// Seul le compte Swan (compte pro intégré à Pennylane) est gardé : Pennylane liste aussi le compte Qonto.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylaneBase.ts';

interface CompteBancaire {
  id?: number | string;
  name?: string;
  iban?: string | null;
  balance?: string | number | null;
  [k: string]: unknown;
}

interface TransactionPennylane {
  id?: number | string;
  label?: string | null;
  date?: string | null;
  amount?: string | number | null;
  bank_account?: { id?: number | string } | null;
  [k: string]: unknown;
}

const MAX_PAGES = 30;

/** Opérations d'un compte : filtre côté Pennylane, sinon repli en filtrant ici. */
async function lireTransactions(token: string, compteId: number | string): Promise<TransactionPennylane[]> {
  const lire = async (filter: string | null) => {
    const out: TransactionPennylane[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ limit: '100' });
      if (filter) q.set('filter', filter);
      if (cursor) q.set('cursor', cursor);
      const rep: { items?: TransactionPennylane[]; has_more?: boolean; next_cursor?: string | null } =
        await fetchJson(`${PENNYLANE_BASE}/transactions?${q}`, { headers: pennylaneHeaders(token), timeoutMs: 20_000 });
      out.push(...(rep.items ?? []));
      if (!rep.has_more || !rep.next_cursor) break;
      cursor = rep.next_cursor;
    }
    return out;
  };
  try {
    return await lire(JSON.stringify([{ field: 'bank_account_id', operator: 'eq', value: String(compteId) }]));
  } catch (err) {
    if (!(err instanceof ExternalApiError) || (err.status !== 400 && err.status !== 422)) throw err;
    const toutes = await lire(null);
    return toutes.filter((t) => String(t.bank_account?.id ?? '') === String(compteId));
  }
}

/** Pennylane renvoie des montants décimaux en euros ("1234.56") → centimes. */
function eurosVersCentimes(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  const supabase = getServiceClient();
  const acces = await exigerPermission(req, supabase, 'finance.tresorerie', 'update');
  if (!acces.ok) return acces.response;
  const companyId = acces.companyId;
  try {
    const token = pennylaneToken();
    const comptes: CompteBancaire[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const url: string = `${PENNYLANE_BASE}/bank_accounts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const rep: { items?: CompteBancaire[]; has_more?: boolean; next_cursor?: string | null } =
        await fetchJson(url, { headers: pennylaneHeaders(token) });
      comptes.push(...(rep.items ?? []));
      if (!rep.has_more || !rep.next_cursor) break;
      cursor = rep.next_cursor;
    }

    // Pennylane ne renvoie pas d'IBAN : le compte Swan s'y appelle « Compte Pro Pennylane » (l'autre : « Compte principal » = Qonto).
    const estSwan = (c: CompteBancaire) => (c.name ?? '').toLowerCase().includes('compte pro pennylane');
    let snapshots = 0;
    let balanceCts = 0;
    let transactionsUpserted = 0;
    let transactionsError: string | null = null;
    for (const c of comptes) {
      if (!estSwan(c)) continue;
      // Opérations du compte : une panne ici ne doit pas empêcher d'afficher le solde.
      try {
        const txs = await lireTransactions(token, c.id as number | string);
        const rows = txs.flatMap((t) => {
          const montant = eurosVersCentimes(t.amount);
          if (t.id === undefined || montant === null) return [];
          return [{
            company_id: companyId,
            qonto_id: `swan:${t.id}`,
            label: t.label ?? null,
            amount_cts: Math.abs(montant),
            side: montant < 0 ? 'debit' : 'credit',
            operation_type: null,
            settled_at: t.date ? `${t.date}T12:00:00Z` : null,
            raw_data: t,
            source: 'swan',
          }];
        });
        for (let i = 0; i < rows.length; i += 500) {
          const { error: tErr } = await supabase.from('qonto_transactions')
            .upsert(rows.slice(i, i + 500), { onConflict: 'qonto_id', ignoreDuplicates: true });
          if (tErr) throw new Error(tErr.message);
        }
        transactionsUpserted += rows.length;
      } catch (err) {
        transactionsError = err instanceof ExternalApiError
          ? `Pennylane ${err.status ?? ''} ${JSON.stringify(err.responseBody ?? '').slice(0, 300)}`
          : (err as Error).message;
        console.log('pennylane transactions error', transactionsError);
      }
      const cts = eurosVersCentimes(c.balance);
      if (cts === null) continue;
      const { error } = await supabase.from('treasury_snapshots').insert({
        company_id: companyId,
        balance_cts: cts,
        authorized_balance_cts: null,
        iban: null,
        source: 'pennylane',
      });
      if (error) return jsonResponse({ ok: false, error: error.message }, 500);
      snapshots += 1;
      balanceCts += cts;
    }
    return jsonResponse({
      ok: true,
      data: { snapshots, balance_cts: balanceCts, comptes_vus: comptes.length, transactions_upserted: transactionsUpserted, transactions_error: transactionsError },
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({ ok: false, error: err.message, status: err.status, body: err.responseBody }, 502);
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
