// Corps de l'import d'un justificatif (ticket, dépense) comme facture fournisseur Pennylane — PUR (aucun
// Deno.env, aucun fetch), testé par vitest. Pennylane exige : supplier_id, date, deadline, currency_amount_before_tax,
// currency_amount, currency_tax, invoice_lines (vérifié sur l'API le 23/10/2026).
import { codeTvaLegal } from './lignesFacture.ts';

/** TTC (centimes) + taux de TVA (%) → HT et TVA (centimes), la TVA arrondie, le HT = TTC − TVA. */
export function ventilerTtc(ttcCts: number, tauxPct: number): { htCts: number; tvaCts: number } {
  const tvaCts = Math.round(ttcCts - ttcCts / (1 + tauxPct / 100));
  return { htCts: ttcCts - tvaCts, tvaCts };
}

const euros = (cts: number) => (cts / 100).toFixed(2);

export interface EntreeImport {
  fileAttachmentId: number | string;
  /** Identifiant du fournisseur CHEZ Pennylane (`suppliers.pennylane_id`). */
  supplierPennylaneId: string | number;
  /** Jour de la dépense, 'AAAA-MM-JJ' (sert aussi d'échéance : dépense déjà payée). */
  date: string;
  libelle: string;
  ttcCts: number;
  tauxPct: number;
}

/** Ce qui manque pour pouvoir envoyer ; liste vide = prêt. */
export function manquesEnvoiPennylane(t: {
  montant_ttc_cts?: number | null; date_depense?: string | null; supplier_id?: string | null; tva_rate?: number | null
}): string[] {
  const m: string[] = [];
  if (t.montant_ttc_cts == null || t.montant_ttc_cts <= 0) m.push('montant');
  if (!t.supplier_id) m.push('fournisseur');
  if (t.tva_rate == null || codeTvaLegal(Number(t.tva_rate)) === null) m.push('taux de TVA');
  return m;
}

export function corpsImportFournisseur(e: EntreeImport): Record<string, unknown> {
  const code = codeTvaLegal(e.tauxPct);
  if (code === null) throw new Error(`Taux de TVA inconnu : ${e.tauxPct} %`);
  const { htCts, tvaCts } = ventilerTtc(e.ttcCts, e.tauxPct);
  return {
    file_attachment_id: e.fileAttachmentId,
    // Les identifiants Pennylane sont des entiers ; stockés en texte côté site.
    supplier_id: /^\d+$/.test(String(e.supplierPennylaneId)) ? Number(e.supplierPennylaneId) : e.supplierPennylaneId,
    date: e.date,
    deadline: e.date,
    currency: 'EUR',
    currency_amount_before_tax: euros(htCts),
    currency_amount: euros(e.ttcCts),
    currency_tax: euros(tvaCts),
    invoice_lines: [{
      label: e.libelle,
      quantity: 1,
      unit: 'piece',
      raw_currency_unit_price: euros(htCts),
      vat_rate: code,
      currency_amount: euros(e.ttcCts),
      currency_tax: euros(tvaCts),
    }],
  };
}
