// Edge Function `pennylane-solde` — solde du compte pro Pennylane, EN LECTURE SEULE.
// GET /bank_accounts (Pennylane V2) → 1 ligne par compte dans treasury_snapshots (source = 'pennylane').
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
    for (const c of comptes) {
      if (!estSwan(c)) continue;
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
      data: { snapshots, balance_cts: balanceCts, comptes_vus: comptes.length },
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({ ok: false, error: err.message, status: err.status, body: err.responseBody }, 502);
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
