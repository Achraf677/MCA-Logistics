// Edge Function `pennylane-sync` — ingestion factures fournisseurs Pennylane EN LECTURE SEULE.
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

// ── Types Pennylane V2 ─────────────────────────────────────────────────────────
interface PennylaneSupplierRef {
  id:  number;
  url: string;
}

interface PennylaneInvoiceLines {
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
  invoice_lines:                PennylaneInvoiceLines | null;
}

interface InvoicesPage {
  items:       PennylaneSupplierInvoice[];
  has_more:    boolean;
  next_cursor: string | null;
}

// Ligne de facture — champ vat_rate : code Pennylane ("FR_200", "FR_100", "FR_055", "FR_021", "FR_000")
// ou valeur numérique directe selon la version de l'API.
interface PennylaneInvoiceLine {
  id:                         number;
  label:                      string | null;
  currency_amount_before_tax: string | null;  // montant HT de la ligne
  vat_rate:                   string | number | null;
}

// Réponse GET /supplier_invoices/{id}/invoice_lines
interface InvoiceLinesResponse {
  invoice_lines?: PennylaneInvoiceLine[];
  items?:         PennylaneInvoiceLine[];  // fallback si la clé change
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
 * Décode un code TVA Pennylane vers un taux numérique (%).
 * "FR_200" → 20.0 · "FR_100" → 10.0 · "FR_055" → 5.5 · "FR_021" → 2.1 · "FR_000" → 0.0
 * "exempt" → 0.0 (exonéré de TVA)
 * Valeur numérique directe (ex. 20) → passée telle quelle.
 * Code non reconnu → null (on ne devine jamais).
 */
function decodeVatCode(code: string | number | null | undefined): number | null {
  if (code == null) return null;
  if (typeof code === 'number') return code;
  const s = String(code).toLowerCase().trim();
  if (s === 'exempt' || s === 'fr_000' || s === '0') return 0;
  // "FR_200" → extrait les chiffres finaux → parseInt / 10
  const m = s.match(/(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10) / 10;
}

/**
 * Récupère le taux TVA dominant d'une facture via ses lignes.
 * "Dominant" = ligne avec le plus grand montant HT.
 * Retourne null si les lignes sont inaccessibles ou le code inconnu.
 */
async function fetchDominantVatRate(
  invoiceLinesUrl: string,
  token: string,
): Promise<number | null> {
  try {
    const data = await fetchJson<InvoiceLinesResponse>(
      invoiceLinesUrl,
      { headers: pennylaneHeaders(token) },
    );
    const lines = data.invoice_lines ?? data.items ?? [];
    if (lines.length === 0) return null;

    let dominant = lines[0];
    for (const line of lines) {
      if (toCents(line.currency_amount_before_tax) > toCents(dominant.currency_amount_before_tax)) {
        dominant = line;
      }
    }
    return decodeVatCode(dominant.vat_rate);
  } catch {
    return null;
  }
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

  const token = Deno.env.get('PENNYLANE_ACHATS_TOKEN');
  if (!token) {
    return jsonResponse({ ok: false, error: 'missing PENNYLANE_ACHATS_TOKEN' }, 500);
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

        // Taux TVA : lu depuis les lignes de facture — JAMAIS recalculé depuis les montants.
        let tvaRate: number | null = null;
        if (inv.invoice_lines?.url) {
          tvaRate = await fetchDominantVatRate(inv.invoice_lines.url, token);

        }

        chargeRows.push({
          company_id:          companyId,
          pennylane_id:        String(inv.id),
          supplier_id:         supplierPid ? (pidToUuid.get(supplierPid) ?? null) : null,
          date:                inv.date,
          label:               inv.label ?? inv.invoice_number ?? `Facture Pennylane #${inv.id}`,
          montant_ht_cts:      htCts,
          tva_cts:             tvaCts,
          montant_ttc_cts:     ttcCts,
          tva_rate:            tvaRate,   // null si inconnu, jamais une approximation
          category:            null,
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
