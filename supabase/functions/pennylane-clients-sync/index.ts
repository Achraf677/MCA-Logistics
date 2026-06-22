// Edge Function `pennylane-clients-sync` — ingestion clients Pennylane EN LECTURE SEULE.
// Pour chaque client Pennylane :
//   - upsert dans `clients` (company_id, pennylane_id), idempotent.
// Sens unique : uniquement des GET vers Pennylane. Jamais de POST/PUT/PATCH/DELETE.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';

// ── Types Pennylane V2 — GET /customers ───────────────────────────────────────
// L'adresse de facturation est un objet imbriqué { address, postal_code, city, country_alpha2 }.
// Les e-mails peuvent être un tableau d'objets { id, address } ou de strings.
interface PennylaneAddress {
  address:       string | null;
  postal_code:   string | null;
  city:          string | null;
  country_alpha2?: string | null;
}

interface PennylaneCustomer {
  id:              number;
  name:            string | null;
  // Pennylane V2 retourne reg_no = SIREN (9 chiffres), pas de SIRET complet
  reg_no:          string | null;
  // TVA intracommunautaire
  vat_number:      string | null;
  billing_address: PennylaneAddress | null;
  // emails = tableau de strings (payload réel confirmé)
  emails:          string[] | null;
  phone:           string | null;
}

interface CustomersPage {
  items:       PennylaneCustomer[];
  has_more:    boolean;
  next_cursor: string | null;
}

// ── Helper : extrait le premier e-mail ───────────────────────────────────────
function firstEmail(emails: string[] | null | undefined): string | null {
  if (!emails || emails.length === 0) return null;
  return emails[0] || null;
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const supabase = getServiceClient();

  const { data: company, error: cErr } = await supabase
    .from('companies').select('id').limit(1).single();
  if (cErr || !company) {
    return jsonResponse({ ok: false, error: 'company not found' }, 404);
  }
  const companyId = company.id as string;

  try {
    let cursor: string | null = null;
    let pages = 0;
    let clientsUpserts = 0;
    const errors: string[] = [];
    let debugFirstCustomer: unknown = null;

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

      // Capture le premier client brut pour débogage initial (supprimable après validation)
      if (pages === 1 && customers.length > 0) {
        debugFirstCustomer = customers[0];
      }

      const clientRows = customers
        .filter((c) => {
          // GARDE-FOU : id manquant → skip + warning
          if (c.id == null) {
            errors.push(`warn: customer sans id — skippé`);
            return false;
          }
          return true;
        })
        .map((c) => ({
          company_id:   companyId,
          pennylane_id: String(c.id),
          name:         c.name ?? `Client Pennylane #${c.id}`,
          // reg_no = SIREN (9 chiffres) — seul identifiant dispo dans Pennylane V2
          siret:        c.reg_no ?? null,
          tva_intra:    c.vat_number ?? null,
          address:      c.billing_address?.address ?? null,
          city:         c.billing_address?.city ?? null,
          postal_code:  c.billing_address?.postal_code ?? null,
          email:        firstEmail(c.emails),
          phone:        c.phone ?? null,
          // `type` non importé : contrainte DB ('medical','ecommerce','retail','particulier')
          // `tariff_mode`, `payment_terms`, `notes` préservés (non touchés).
          active: true,
        }));

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
        _debug_first_customer: debugFirstCustomer,
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
