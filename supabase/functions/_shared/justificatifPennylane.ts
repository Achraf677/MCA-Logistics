// Corps de l'import d'un justificatif (ticket, dépense) comme facture fournisseur Pennylane — PUR (aucun
// Deno.env, aucun fetch), testé par vitest. Pennylane exige : supplier_id, date, deadline, currency_amount_before_tax,
// currency_amount, currency_tax, invoice_lines (vérifié sur l'API le 23/10/2026).

/**
 * Codes TVA d'une facture FOURNISSEUR chez Pennylane. Ce ne sont pas ceux d'une facture client
 * (`lignesFacture#codeTvaLegal` : FR_055, FR_021, FR_000) : l'API fournisseur n'accepte que FR_55, FR_21, FR_100,
 * FR_200… (énumération renvoyée par Pennylane le 23/10/2026). Clé = taux en dixièmes de point.
 * 0 % : `exempt` (code d'exonération documenté par Pennylane) — à confirmer au premier envoi.
 */
const CODES_FOURNISSEUR: Record<number, string> = {
  200: 'FR_200',
  100: 'FR_100',
  55: 'FR_55',
  21: 'FR_21',
  0: 'exempt',
};

export function codeTvaFournisseur(ratePct: number): string | null {
  if (!Number.isFinite(ratePct)) return null;
  return CODES_FOURNISSEUR[Math.round(ratePct * 10)] ?? null;
}

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

/** Fournisseur générique des dépenses envoyées sans fournisseur (décision du 23/10/2026). */
export const FOURNISSEUR_GENERIQUE = 'Note de frais';

/** Taux appliqué quand le bureau n'a pas précisé la TVA : 0 % (à corriger dans « à traiter » de Pennylane). */
export const TAUX_PAR_DEFAUT = 0;

/**
 * Ce qui manque pour pouvoir envoyer ; liste vide = prêt. Seul le montant est exigé : sans fournisseur choisi on
 * prend « Note de frais », sans taux 0 % ; un taux renseigné mais inconnu est refusé (on ne devine pas).
 */
export function manquesEnvoiPennylane(t: {
  montant_ttc_cts?: number | null; tva_rate?: number | null
}): string[] {
  const m: string[] = [];
  if (t.montant_ttc_cts == null || t.montant_ttc_cts <= 0) m.push('montant');
  if (t.tva_rate != null && codeTvaFournisseur(Number(t.tva_rate)) === null) m.push('taux de TVA reconnu');
  return m;
}

export function corpsImportFournisseur(e: EntreeImport): Record<string, unknown> {
  const code = codeTvaFournisseur(e.tauxPct);
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
      vat_rate: code,
      currency_amount: euros(e.ttcCts),
      currency_tax: euros(tvaCts),
    }],
  };
}
