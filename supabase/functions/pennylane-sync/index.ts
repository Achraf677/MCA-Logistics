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

// ── Types Pennylane V2 confirmés par inspection du payload réel ───────────────
// Le fournisseur est un objet imbriqué { id, url } — PAS de champs plats supplier_id/supplier_name.
interface PennylaneSupplierRef {
  id:  number;
  url: string;   // URL directe vers GET /suppliers/{id}
}

interface PennylaneSupplierInvoice {
  id:                           number;
  invoice_number:               string | null;
  date:                         string | null;   // ISO 8601 YYYY-MM-DD
  label:                        string | null;
  currency_amount_before_tax:   string | null;   // HT en euros, string décimal
  currency_tax:                 string | null;   // TVA en euros, string décimal
  currency_amount:              string | null;   // TTC en euros, string décimal
  supplier:                     PennylaneSupplierRef | null;
  public_file_url:              string | null;   // URL PDF (peut expirer)
}

interface InvoicesPage {
  items:       PennylaneSupplierInvoice[];
  has_more:    boolean;
  next_cursor: string | null;
}

// Détail fournisseur — GET /suppliers/{id} (ou via supplier.url)
interface PennylaneSupplierDetail {
  id:               number;
  name:             string | null;
  reg_no:           string | null;           // SIREN (9 chiffres)
  establishment_no: string | null;           // SIRET (14 chiffres)
  vat_number:       string | null;
}

// L'API V2 enveloppe le détail dans { supplier: {...} }
interface PennylaneSupplierDetailResponse {
  supplier?: PennylaneSupplierDetail;
  // fallback : certaines réponses retournent l'objet directement
  id?:  number;
  name?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toCents(euroStr: string | null | undefined): number {
  if (!euroStr) return 0;
  return Math.round(parseFloat(euroStr) * 100);
}

async function fetchSupplierDetail(
  supplierUrl: string,
  token: string,
): Promise<PennylaneSupplierDetail | null> {
  try {
    const raw = await fetchJson<PennylaneSupplierDetailResponse>(
      supplierUrl,
      { headers: pennylaneHeaders(token) },
    );
    // Gère wrapper { supplier: {...} } ET réponse directe
    return raw.supplier ?? (raw as unknown as PennylaneSupplierDetail) ?? null;
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const token = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!token) {
    return jsonResponse({ ok: false, error: 'missing PENNYLANE_API_TOKEN' }, 500);
  }

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
    let suppliersUpserts = 0;
    let chargesUpserts = 0;
    const errors: string[] = [];

    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);

      const page = await fetchJson<InvoicesPage>(
        `${BASE}/supplier_invoices?${qs}`,
        { headers: pennylaneHeaders(token), timeoutMs: 30_000 },
      );

      pages++;
      const invoices = page.items ?? [];
      if (invoices.length === 0) break;

      // ── 1. Collecte les références fournisseurs uniques de la page ─────────
      // Clé = String(supplier.id), valeur = supplier.url pour le fetch détail.
      const supplierRefs = new Map<string, string>(); // pid → url
      for (const inv of invoices) {
        if (inv.supplier?.id != null) {
          const pid = String(inv.supplier.id);
          if (!supplierRefs.has(pid)) supplierRefs.set(pid, inv.supplier.url);
        }
      }

      // ── 2. Fetch détail de chaque fournisseur unique (séquentiel, ~5-15/page) ─
      const supplierDetailMap = new Map<string, PennylaneSupplierDetail>(); // pid → détail
      for (const [pid, url] of supplierRefs.entries()) {
        const detail = await fetchSupplierDetail(url, token);
        if (detail) supplierDetailMap.set(pid, detail);
      }

      // ── 3. Batch upsert fournisseurs ───────────────────────────────────────
      // N'inclut que name/siret/tva_intra dans la row → les champs manuels sont préservés.
      const supplierRows = Array.from(supplierDetailMap.entries()).map(([pid, d]) => ({
        company_id:   companyId,
        pennylane_id: pid,
        name:         d.name ?? `Fournisseur Pennylane #${pid}`,
        siret:        d.establishment_no ?? null,
        tva_intra:    d.vat_number ?? null,
      }));

      const { data: upsertedSuppliers, error: sErr } = await supabase
        .from('suppliers')
        .upsert(supplierRows, { onConflict: 'company_id,pennylane_id' })
        .select('id, pennylane_id');

      if (sErr) {
        errors.push(`suppliers upsert p${pages}: ${sErr.message}`);
      } else {
        suppliersUpserts += (upsertedSuppliers?.length ?? 0);
      }

      // pid → UUID local (FK pour charges.supplier_id)
      const pidToUuid = new Map<string, string>();
      for (const s of (upsertedSuppliers ?? [])) {
        pidToUuid.set(s.pennylane_id, s.id);
      }

      // ── 4. Batch upsert charges ────────────────────────────────────────────
      const chargeRows = invoices
        .filter((inv) => inv.date != null)
        .map((inv) => {
          const supplierPid = inv.supplier?.id != null ? String(inv.supplier.id) : null;

          // GARDE-FOU : id fournisseur manquant → supplier_id null, jamais de placeholder
          if (!supplierPid) {
            errors.push(`warn: invoice ${inv.id} — supplier absent, supplier_id laissé null`);
          }

          const htCts  = toCents(inv.currency_amount_before_tax);
          const tvaCts = toCents(inv.currency_tax);
          const ttcCts = toCents(inv.currency_amount);

          return {
            company_id:          companyId,
            pennylane_id:        String(inv.id),
            supplier_id:         supplierPid ? (pidToUuid.get(supplierPid) ?? null) : null,
            date:                inv.date,
            label:               inv.label ?? inv.invoice_number ?? `Facture Pennylane #${inv.id}`,
            montant_ht_cts:      htCts,
            tva_cts:             tvaCts,
            montant_ttc_cts:     ttcCts,
            tva_rate:            htCts > 0 ? parseFloat((tvaCts / htCts * 100).toFixed(2)) : null,
            category:            null,
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
