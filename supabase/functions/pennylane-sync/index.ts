// Edge Function `pennylane-sync` — ingestion factures fournisseurs Pennylane EN LECTURE SEULE.
// Pour chaque facture fournisseur Pennylane :
//   - upsert le fournisseur dans `suppliers` (company_id, pennylane_id) ;
//   - upsert la charge dans `charges` (company_id, pennylane_id), idempotent.
// Sens unique : uniquement des GET vers Pennylane. Jamais de POST/PUT/PATCH/DELETE.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';

const BASE = 'https://app.pennylane.com/api/external/v2';

function pennylaneHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'X-Use-2026-API-Changes': 'true',
  };
}

// ── Types Pennylane V2 — champs confirmés par la doc officielle ────────────────
interface PennylaneSupplierInvoice {
  id:                           number;
  invoice_number:               string | null;
  date:                         string | null;    // ISO 8601 YYYY-MM-DD
  label:                        string | null;
  currency_amount_before_tax:   string | null;    // HT en euros, string décimal
  currency_tax:                 string | null;    // TVA en euros, string décimal
  currency_amount:              string | null;    // TTC en euros, string décimal
  supplier_id:                  number;
  supplier_name:                string | null;
  public_file_url:              string | null;    // URL PDF (expirable)
}

interface InvoicesPage {
  items:       PennylaneSupplierInvoice[];
  has_more:    boolean;
  next_cursor: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toCents(euroStr: string | null | undefined): number {
  if (!euroStr) return 0;
  return Math.round(parseFloat(euroStr) * 100);
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  // ── Garde : secret obligatoire (jamais loggué) ─────────────────────────────
  const token = Deno.env.get('PENNYLANE_ACHATS_TOKEN');
  if (!token) {
    return jsonResponse({ ok: false, error: 'missing PENNYLANE_ACHATS_TOKEN' }, 500);
  }

  const supabase = getServiceClient();

  // ── Mono-société : même pattern que qonto-sync ─────────────────────────────
  const { data: company, error: cErr } = await supabase
    .from('companies').select('id').limit(1).single();
  if (cErr || !company) {
    return jsonResponse({ ok: false, error: 'company not found' }, 404);
  }
  const companyId = company.id as string;

  try {
    let cursor: string | null = null;
    let pages = 0;
    let suppliersUpserts = 0;
    let chargesUpserts = 0;
    const errors: string[] = [];

    do {
      // ── Pagination curseur (limit max 100, re-envoyer params à chaque page) ─
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);

      const page = await fetchJson<InvoicesPage>(
        `${BASE}/supplier_invoices?${qs}`,
        { headers: pennylaneHeaders(token), timeoutMs: 30_000 },
      );

      pages++;
      const invoices = page.items ?? [];
      if (invoices.length === 0) break;

      // ── Batch fournisseurs : 1 upsert + 1 select par page ─────────────────
      // Déduplique les supplier_id de la page courante.
      const seenPid = new Map<string, string>(); // pennylane_id → name
      for (const inv of invoices) {
        const pid = String(inv.supplier_id);
        if (!seenPid.has(pid)) {
          seenPid.set(pid, inv.supplier_name ?? `Fournisseur Pennylane #${inv.supplier_id}`);
        }
      }

      const supplierRows = Array.from(seenPid.entries()).map(([pid, name]) => ({
        company_id:    companyId,
        pennylane_id:  pid,
        name,
      }));

      // onConflict : index partiel suppliers_company_pennylane_uniq.
      // N'écrase que le champ `name` ; siret/tva_intra manuels sont préservés.
      const { data: upsertedSuppliers, error: sErr } = await supabase
        .from('suppliers')
        .upsert(supplierRows, { onConflict: 'company_id,pennylane_id' })
        .select('id, pennylane_id');

      if (sErr) {
        errors.push(`suppliers upsert p${pages}: ${sErr.message}`);
      } else {
        suppliersUpserts += (upsertedSuppliers?.length ?? 0);
      }

      // Map pennylane_id fournisseur → UUID local (pour la FK charges.supplier_id).
      const pidToUuid = new Map<string, string>();
      for (const s of (upsertedSuppliers ?? [])) {
        pidToUuid.set(s.pennylane_id, s.id);
      }

      // ── Batch charges ──────────────────────────────────────────────────────
      const chargeRows = invoices
        .filter((inv) => inv.date != null)  // date NOT NULL dans la table
        .map((inv) => {
          const htCts  = toCents(inv.currency_amount_before_tax);
          const tvaCts = toCents(inv.currency_tax);
          const ttcCts = toCents(inv.currency_amount);
          // Taux TVA calculé depuis les montants centimes (arrondi 2 déc.).
          const tvaRate = htCts > 0
            ? parseFloat((tvaCts / htCts * 100).toFixed(2))
            : null;

          return {
            company_id:          companyId,
            pennylane_id:        String(inv.id),
            supplier_id:         pidToUuid.get(String(inv.supplier_id)) ?? null,
            date:                inv.date,
            label:               inv.label ?? inv.invoice_number ?? `Facture Pennylane #${inv.id}`,
            montant_ht_cts:      htCts,
            tva_cts:             tvaCts,
            montant_ttc_cts:     ttcCts,
            tva_rate:            tvaRate,
            category:            null,          // mapping catégorie = étape ultérieure
            receipt_url:         inv.public_file_url ?? null,
            pennylane_synced_at: new Date().toISOString(),
          };
        });

      if (chargeRows.length > 0) {
        const { data: upsertedCharges, error: chErr } = await supabase
          .from('charges')
          .upsert(chargeRows, { onConflict: 'company_id,pennylane_id' })
          .select('id');

        if (chErr) {
          errors.push(`charges upsert p${pages}: ${chErr.message}`);
        } else {
          chargesUpserts += (upsertedCharges?.length ?? 0);
        }
      }

      // ── Prochaine page ────────────────────────────────────────────────────
      cursor = page.has_more ? (page.next_cursor ?? null) : null;
    } while (cursor !== null);

    return jsonResponse({
      ok:   true,
      data: { suppliers_upserts: suppliersUpserts, charges_upserts: chargesUpserts, pages, errors },
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
