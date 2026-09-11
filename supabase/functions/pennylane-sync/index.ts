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
    // Charges saisies a la main que la synchro a reconnues chez Pennylane.
    let adoptions = 0;
    const errors: string[] = [];
    // Tous les pennylane_id vus dans CE sync — sert à détecter les factures
    // supprimées côté Pennylane (absentes de la liste courante).
    const seenPennylaneIds = new Set<string>();

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

        seenPennylaneIds.add(String(inv.id));
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
          // Présente dans la liste courante → efface un éventuel signalement
          // de suppression (l'id a "réapparu" côté Pennylane).
          pennylane_deleted_at: null,
        });
      }

      // ── 4 bis. Adoption des charges saisies a la main ─────────────────────
      //
      // Probleme resolu ici : une charge saisie dans le site n'a pas de
      // `pennylane_id`. Le jour ou la meme facture est saisie chez Pennylane,
      // l'upsert ci-dessous ne la reconnait pas et cree une SECONDE ligne. On
      // se retrouve avec un doublon a supprimer a la main, et deux fois le
      // montant dans les totaux tant qu'on ne l'a pas vu.
      //
      // On rattache donc la facture Pennylane a la charge locale qui lui
      // correspond, AVANT l'upsert : celui-ci met alors a jour la ligne
      // existante au lieu d'en creer une.
      //
      // TROIS GARDE-FOUS, parce qu'un mauvais rattachement fusionnerait deux
      // factures differentes et que personne ne le verrait :
      //   1. montant TTC EXACTEMENT identique, au centime. Aucune tolerance ;
      //   2. date a 7 jours ou moins — une facture peut etre datee du jour de
      //      l'achat ici et du jour de reception chez le comptable ;
      //   3. UN SEUL candidat. Si deux charges locales collent, on ne touche a
      //      rien : une ambiguite ne se tranche pas en devinant. Le doublon
      //      sera cree, et l'alerte « charges absentes de Pennylane » le
      //      signalera — c'est moins grave que de fusionner a tort.
      //
      // Chaque adoption laisse une trace dans les notes de la charge : un
      // rattachement silencieux serait impossible a auditer ou a defaire.
      if (chargeRows.length > 0) {
        // Chaque synchro relit TOUTES les factures, y compris celles deja en
        // base. Sans ce filtre, on tenterait de rattacher une charge locale a
        // une facture qui a deja sa ligne — l'ecriture echouerait sur la
        // contrainte d'unicite (company_id, pennylane_id) et remplirait le
        // rapport d'avertissements sans aucun effet utile.
        const idsDeLaPage = chargeRows.map((r) => r.pennylane_id as string);
        const { data: dejaLa } = await supabase
          .from('charges')
          .select('pennylane_id')
          .eq('company_id', companyId)
          .in('pennylane_id', idsDeLaPage);
        const connues = new Set((dejaLa ?? []).map((c) => c.pennylane_id as string));

        const { data: orphelines } = await supabase
          .from('charges')
          .select('id, date, montant_ttc_cts, notes')
          .eq('company_id', companyId)
          .is('pennylane_id', null)
          .eq('est_immobilisation', false);

        // Retirees du vivier au fur et a mesure : deux factures Pennylane ne
        // peuvent pas revendiquer la meme charge locale.
        const vivier = [...(orphelines ?? [])] as Array<
          { id: string; date: string; montant_ttc_cts: number | null; notes: string | null }
        >;

        const JOUR = 86_400_000;
        for (const row of chargeRows) {
          if (connues.has(row.pennylane_id as string)) continue; // facture deja en base
          const ttc = row.montant_ttc_cts as number;
          const dateFacture = Date.parse(`${row.date as string}T00:00:00Z`);
          if (!Number.isFinite(ttc) || Number.isNaN(dateFacture)) continue;

          const candidats = vivier.filter((o) => {
            if (o.montant_ttc_cts !== ttc) return false;
            const d = Date.parse(`${o.date}T00:00:00Z`);
            return !Number.isNaN(d) && Math.abs(d - dateFacture) <= 7 * JOUR;
          });
          if (candidats.length !== 1) continue;

          const adoptee = candidats[0];
          const trace = `Rattachée automatiquement à la facture Pennylane #${row.pennylane_id} le ${new Date().toISOString().slice(0, 10)}.`;
          const { error: adoptErr } = await supabase
            .from('charges')
            .update({
              pennylane_id: row.pennylane_id,
              notes: adoptee.notes ? `${adoptee.notes}\n${trace}` : trace,
            })
            .eq('id', adoptee.id)
            .is('pennylane_id', null); // course : ne rattache pas deux fois

          if (adoptErr) {
            errors.push(`warn: rattachement charge ${adoptee.id} echoue: ${adoptErr.message}`);
            continue;
          }
          adoptions += 1;
          vivier.splice(vivier.indexOf(adoptee), 1);
        }
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
            data:  { suppliers_upserts: suppliersUpserts, charges_upserts: chargesUpserts, adoptions, pages, errors },
          }, 500);
        }
        chargesUpserts += (upsertedCharges?.length ?? 0);
      }

      cursor = page.has_more ? (page.next_cursor ?? null) : null;
    } while (cursor !== null);

    // ── Détection des factures SUPPRIMÉES côté Pennylane ──────────────────────
    // On n'arrive ici qu'après avoir parcouru TOUTES les pages : seenPennylaneIds
    // est complet. Toute charge locale liée à un pennylane_id absent de la liste
    // courante est SIGNALÉE (pennylane_deleted_at=now()) — jamais supprimée.
    // Le retour à null en cas de réapparition est géré par l'upsert ci-dessus.
    let deleted_flagged = 0;
    {
      const { data: localCharges, error: lcErr } = await supabase
        .from('charges')
        .select('id, pennylane_id')
        .eq('company_id', companyId)
        .not('pennylane_id', 'is', null)
        .is('pennylane_deleted_at', null);
      if (lcErr) {
        errors.push(`detect deleted: ${lcErr.message}`);
      } else {
        const missingIds = (localCharges ?? [])
          .filter((c) => !seenPennylaneIds.has(c.pennylane_id as string))
          .map((c) => c.id as string);
        if (missingIds.length > 0) {
          const { error: updErr } = await supabase
            .from('charges')
            .update({ pennylane_deleted_at: new Date().toISOString() })
            .in('id', missingIds);
          if (updErr) errors.push(`flag deleted: ${updErr.message}`);
          else deleted_flagged = missingIds.length;
        }
      }
    }

    // Horodatage du dernier run réussi — même si 0 nouveauté.
    await supabase.from('integration_sync_state').upsert(
      { company_id: companyId, integration: 'pennylane_charges', last_run_at: new Date().toISOString() },
      { onConflict: 'company_id,integration' },
    );

    return jsonResponse({
      ok:   true,
      data: { suppliers_upserts: suppliersUpserts, charges_upserts: chargesUpserts, adoptions, pages, deleted_flagged, errors },
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
