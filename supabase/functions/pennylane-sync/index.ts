// Edge Function `pennylane-sync` — ingestion factures fournisseurs Pennylane EN LECTURE SEULE.
// Sens unique : uniquement des GET vers Pennylane. Jamais de POST/PUT/PATCH/DELETE.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { ExternalApiError, fetchJson } from '../_shared/http.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';

// ── Types Pennylane V2 ─────────────────────────────────────────────────────────
interface PennylaneSupplierRef {
  id:  number;
  url: string;
}

interface PennylaneSupplierInvoice {
  id:                           number;
  invoice_number:               string | null;
  date:                         string | null;
  label:                        string | null;
  currency_amount_before_tax:   string | null;
  currency_tax:                 string | null;
  currency_amount:              string | null;
  supplier:                     PennylaneSupplierRef | null;
  public_file_url:              string | null;
}

interface InvoicesPage {
  items:       PennylaneSupplierInvoice[];
  has_more:    boolean;
  next_cursor: string | null;
}

// Détail fournisseur
interface PennylaneSupplierDetail {
  id:               number;
  name:             string | null;
  reg_no:           string | null;
  establishment_no: string | null;
  vat_number:       string | null;
}
interface PennylaneSupplierDetailResponse {
  supplier?: PennylaneSupplierDetail;
  id?:       number;
  name?:     string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toCents(euroStr: string | null | undefined): number {
  if (!euroStr) return 0;
  return Math.round(parseFloat(euroStr) * 100);
}

/**
 * Taux TVA dérivé des montants — SOURCE PRIMAIRE (déterministe).
 * Fonctionne en valeur absolue pour les avoirs (montants négatifs).
 * absTva=0 → 0 (exonéré/marge). raw = round(absTva/absHt*1000)/10 (1 décimale).
 * Calage sur {0, 5.5, 10, 19, 20} ±1.5 ; hors tolérance → taux brut (jamais null).
 */
function snapVatRate(tvaCts: number, htCts: number): number {
  const absHt  = Math.abs(htCts);
  const absTva = Math.abs(tvaCts);
  if (absHt === 0 || absTva === 0) return 0;
  const raw = Math.round(absTva / absHt * 1000) / 10;
  const STANDARDS = [0, 5.5, 10, 19, 20];
  const TOLERANCE = 1.5;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const s of STANDARDS) {
    const dist = Math.abs(raw - s);
    if (dist <= TOLERANCE && dist < bestDist) { bestDist = dist; best = s; }
  }
  return best ?? raw;
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
    return raw.supplier ?? (raw as unknown as PennylaneSupplierDetail) ?? null;
  } catch {
    return null;
  }
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
    let suppliersUpserts = 0;
    let chargesUpserts = 0;
    const errors: string[] = [];

    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);

      const page = await fetchJson<InvoicesPage>(
        `${PENNYLANE_BASE}/supplier_invoices?${qs}`,
        { headers: pennylaneHeaders(token), timeoutMs: 30_000 },
      );

      pages++;
      const invoices = page.items ?? [];
      if (invoices.length === 0) break;

      // ── 1. Fournisseurs uniques de la page ────────────────────────────────
      const supplierRefs = new Map<string, string>(); // pid → url
      for (const inv of invoices) {
        if (inv.supplier?.id != null) {
          const pid = String(inv.supplier.id);
          if (!supplierRefs.has(pid)) supplierRefs.set(pid, inv.supplier.url);
        }
      }

      // ── 2. Fetch détail fournisseurs ──────────────────────────────────────
      const supplierDetailMap = new Map<string, PennylaneSupplierDetail>();
      for (const [pid, url] of supplierRefs.entries()) {
        const detail = await fetchSupplierDetail(url, token);
        if (detail) supplierDetailMap.set(pid, detail);
      }

      // ── 3. Batch upsert fournisseurs ──────────────────────────────────────
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

      const pidToUuid = new Map<string, string>();
      for (const s of (upsertedSuppliers ?? [])) {
        pidToUuid.set(s.pennylane_id, s.id);
      }

      // ── 4. Batch upsert charges (tva_rate depuis les lignes, jamais recalculé) ─
      const chargeRows: Record<string, unknown>[] = [];
      for (const inv of invoices) {
        if (inv.date == null) continue;

        const supplierPid = inv.supplier?.id != null ? String(inv.supplier.id) : null;
        if (!supplierPid) {
          errors.push(`warn: invoice ${inv.id} — supplier absent, supplier_id laissé null`);
        }

        const htCts  = toCents(inv.currency_amount_before_tax);
        const tvaCts = toCents(inv.currency_tax);
        const ttcCts = toCents(inv.currency_amount);

        // Taux TVA dérivé des montants (déterministe, gère avoirs).
        const tvaRate = snapVatRate(tvaCts, htCts);

        chargeRows.push({
          company_id:          companyId,
          pennylane_id:        String(inv.id),
          supplier_id:         supplierPid ? (pidToUuid.get(supplierPid) ?? null) : null,
          date:                inv.date,
          label:               inv.label ?? inv.invoice_number ?? `Facture Pennylane #${inv.id}`,
          montant_ht_cts:      htCts,
          tva_cts:             tvaCts,
          montant_ttc_cts:     ttcCts,
          tva_rate:            tvaRate,
          receipt_url:         inv.public_file_url ?? null,
          pennylane_synced_at: new Date().toISOString(),
        });
      }

      if (chargeRows.length > 0) {
        const { data: upsertedCharges, error: chErr } = await supabase
          .from('charges')
          .upsert(chargeRows, { onConflict: 'company_id,pennylane_id' })
          .select('id');

        if (chErr) {
          return jsonResponse({
            ok:    false,
            error: `charges upsert p${pages}: ${chErr.message}`,
            data:  { suppliers_upserts: suppliersUpserts, charges_upserts: chargesUpserts, pages, errors },
          }, 500);
        }
        chargesUpserts += (upsertedCharges?.length ?? 0);
      }

      cursor = page.has_more ? (page.next_cursor ?? null) : null;
    } while (cursor !== null);

    // Horodatage du dernier run réussi — même si 0 nouveauté.
    await supabase.from('integration_sync_state').upsert(
      { company_id: companyId, integration: 'pennylane_charges', last_run_at: new Date().toISOString() },
      { onConflict: 'company_id,integration' },
    );

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
