// Edge Function `pennylane-clients-sync` — ingestion clients Pennylane EN LECTURE SEULE.
// Pour chaque client Pennylane :
//   - upsert dans `clients` (company_id, pennylane_id), idempotent.
// Sens unique : uniquement des GET vers Pennylane. Jamais de POST/PUT/PATCH/DELETE.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';
import { normalizeClientName } from '../_shared/normalizeClientName.ts';
import { ligneClientSync } from '../_shared/clientPennylane.ts';
import type { ClientLocal, ClientPennylane } from '../_shared/clientPennylane.ts';

// ── Types Pennylane V2 — GET /customers : voir _shared/clientPennylane#ClientPennylane
interface CustomersPage {
  items:       ClientPennylane[];
  has_more:    boolean;
  next_cursor: string | null;
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const supabase = getServiceClient();

  // Contrôle d'accès (U1) : le service role contourne la RLS → on revérifie
  // l'appelant (synchroniser les clients) et on travaille dans SA société.
  const acces = await exigerPermission(req, supabase, 'tiers.clients', 'update');
  if (!acces.ok) return acces.response;
  const companyId = acces.companyId;

  try {
    let cursor: string | null = null;
    let pages = 0;
    let clientsUpserts = 0;
    const errors: string[] = [];

    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);

      const page = await fetchJson<CustomersPage>(
        `${PENNYLANE_BASE}/customers?${qs}`,
        { headers: pennylaneHeaders(token), timeoutMs: 30_000 },
      );

      pages++;
      const customers = page.items ?? [];
      if (customers.length === 0) break;

      const validCustomers = customers.filter((c) => {
        // GARDE-FOU : id manquant → skip + warning
        if (c.id == null) {
          errors.push(`warn: customer sans id — skippé`);
          return false;
        }
        return true;
      });

      // « Le site gagne » (lot U2, _shared/clientPennylane#ligneClientSync) : nom,
      // SIRET, TVA, coordonnées saisis ici ne sont jamais écrasés ; le SIREN va
      // dans `siren` ; un client archivé reste archivé. On lit donc l'existant
      // AVANT l'upsert.
      const pageIds = validCustomers.map((c) => String(c.id));
      const { data: existingRows, error: exErr } = pageIds.length > 0
        ? await supabase
            .from('clients')
            .select('pennylane_id, name, type, email, phone, address, city, postal_code, siret, siren, tva_intra, pays, active')
            .eq('company_id', companyId)
            .in('pennylane_id', pageIds)
        : { data: [] as ClientLocal[], error: null };
      // Sans l'existant, on écraserait les saisies locales : on s'arrête.
      if (exErr) throw new Error(`lecture des clients existants : ${exErr.message}`);
      const existingByPennylaneId = new Map(
        ((existingRows ?? []) as Array<ClientLocal & { pennylane_id: string }>)
          .map((r) => [r.pennylane_id, r]),
      );

      const clientRows = validCustomers.map((c) =>
        ligneClientSync(c, existingByPennylaneId.get(String(c.id)), companyId, normalizeClientName));

      if (clientRows.length > 0) {
        const { data: upserted, error: uErr } = await supabase
          .from('clients')
          .upsert(clientRows, { onConflict: 'company_id,pennylane_id' })
          .select('id');

        if (uErr) {
          errors.push(`clients upsert p${pages}: ${uErr.message}`);
        } else {
          clientsUpserts += (upserted?.length ?? 0);
        }
      }

      cursor = page.has_more ? (page.next_cursor ?? null) : null;
    } while (cursor !== null);

    // Horodatage du dernier run réussi — même si 0 nouveauté.
    await supabase.from('integration_sync_state').upsert(
      { company_id: companyId, integration: 'pennylane_clients', last_run_at: new Date().toISOString() },
      { onConflict: 'company_id,integration' },
    );

    return jsonResponse({
      ok:   true,
      data: {
        clients_upserts: clientsUpserts,
        pages,
        errors,
      },
    });

  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({
        ok:     false,
        error:  err.message,
        status: err.status,
        body:   err.responseBody,
      }, 502);
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
