// Lignes de facture Pennylane d'une course — PUR (aucun import, aucun Deno.env).
//
// Source unique côté serveur de « ce qui part chez Pennylane » : libellé,
// quantité, HT, code TVA de la ligne principale ET des lignes supplémentaires.
// Sans import pour rester testable par vitest (`lignesFacture.test.ts`), qui
// vérifie aussi la parité avec l'aperçu front
// (src/features/livraisons/apercuFacture.logic.ts).

/**
 * Codes TVA légaux français → codes Pennylane.
 * Clé = taux en dixièmes de point (20 % → 200), pour éviter le flottant.
 */
const CODES_TVA_LEGAUX: Record<number, string> = {
  200: 'FR_200',
  100: 'FR_100',
  55: 'FR_055',
  21: 'FR_021',
  0: 'FR_000',
};

/** Code Pennylane si le taux est EXACTEMENT un taux légal français, sinon null. */
export function codeTvaLegal(ratePct: number): string | null {
  if (!Number.isFinite(ratePct)) return null;
  return CODES_TVA_LEGAUX[Math.round(ratePct * 10)] ?? null;
}

export interface CourseAFacturer {
  id: string;
  date: string | null;
  type: string | null;
  description: string | null;
  /** Référence du donneur d'ordre (ODT, n° de commande) — reprise dans le libellé. */
  reference_client?: string | null;
  /** Messagerie : relevé « nb_colis × prix_unitaire_cts » facturé en quantité. */
  prestation?: string | null;
  nb_colis?: number | null;
  prix_unitaire_cts?: number | null;
  amount_ht_cts: number | null;
  tva_cts: number | null;
  tva_rate: number | string | null;
  autoliquidation: boolean | null;
  extra_lines: unknown;
}

export interface LigneFacture {
  /** id de la course, suffixé `#extra-N` pour une ligne supplémentaire. */
  ref: string;
  label: string;
  quantity: number;
  /** HT UNITAIRE en centimes. */
  amountHtCts: number;
  vatCode: string;
  /** Taux en % ; null en autoliquidation (ce n'est pas un taux, c'est un régime). */
  ratePct: number | null;
}

export type ResultatLignes =
  | { ok: true; lignes: LigneFacture[] }
  | { ok: false; error: string; details?: Record<string, unknown> };

/**
 * Taux de la ligne principale. Le taux STOCKÉ (`tva_rate`) fait foi s'il est
 * légal et cohérent avec la TVA stockée (±1 ct d'arrondi) ; sinon on le déduit
 * de TVA / HT au dixième — un montant de TVA saisi à la main qui ne
 * correspond à aucun taux légal sera alors refusé.
 */
export function tauxLignePrincipale(
  htCts: number,
  tvaCts: number | null,
  tvaRate: number | string | null,
): number {
  const stocke = tvaRate != null && tvaRate !== '' && Number.isFinite(Number(tvaRate))
    ? Number(tvaRate) : null;
  const tva = tvaCts ?? Math.round((htCts * (stocke ?? 20)) / 100);
  if (stocke != null && codeTvaLegal(stocke) !== null
      && Math.abs(Math.round((htCts * stocke) / 100) - tva) <= 1) {
    return stocke;
  }
  if (htCts > 0) return Math.round((tva / htCts) * 1000) / 10;
  return stocke ?? 20;
}

/** Libellé réel de la ligne principale (hors mention d'autoliquidation). */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « septembre 2026 » depuis 'AAAA-MM-JJ'. */
export function moisFr(date: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  return m ? `${MOIS_FR[Number(m[2]) - 1]} ${m[1]}` : '';
}

/**
 * Relevé de messagerie facturable en QUANTITÉ (« 1 240 × 1,00 € ») : seulement
 * si nb_colis × prix_unitaire retombe exactement sur le HT stocké. Sinon null
 * (la ligne part en quantité 1 pour le HT, comme une course).
 */
export function quantiteColis(
  d: Pick<CourseAFacturer, 'prestation' | 'nb_colis' | 'prix_unitaire_cts' | 'amount_ht_cts'>,
): { quantity: number; unitCts: number } | null {
  if (d.prestation !== 'messagerie') return null;
  const n = Number(d.nb_colis);
  const pu = Number(d.prix_unitaire_cts);
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(pu) || pu <= 0) return null;
  return n * pu === d.amount_ht_cts ? { quantity: n, unitCts: pu } : null;
}

export function libelleCourse(
  d: Pick<CourseAFacturer, 'description' | 'type' | 'date'> & { reference_client?: string | null; prestation?: string | null },
): string {
  const desc = d.description?.trim();
  const defaut = d.prestation === 'messagerie'
    ? `Messagerie ${moisFr(d.date)} — colis livrés`.replace('  ', ' ')
    : ['Livraison', d.type ?? '', 'du', d.date ?? ''].filter((s) => s !== '').join(' ');
  const base = desc || defaut;
  // La référence du client sur la facture : c'est elle qu'il rapproche.
  const ref = d.reference_client?.trim();
  return ref && !base.includes(ref) ? `${base} — Réf. ${ref}` : base;
}

function jourFr(iso: string | null): string {
  if (!iso) return '?';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Lignes Pennylane d'une course. Refuse (ok:false, message lisible) plutôt
 * que d'émettre une facture bancale : HT principal ≤ 0, taux non légal,
 * ligne supplémentaire sans libellé / à HT ≤ 0 / à taux non légal.
 *
 * AUTOLIQUIDATION : TOUTES les lignes (principale ET supplémentaires) partent
 * en code autoliquidation — une ligne supplémentaire à 20 % sur une facture
 * autoliquidée ferait payer une TVA que le client ne doit pas.
 */
export function construireLignes(
  d: CourseAFacturer,
  opts: { codeAutoliquidation: string; mentionAutoliquidation: string },
): ResultatLignes {
  const course = `course du ${jourFr(d.date)}`;
  const ht = d.amount_ht_cts;
  if (ht == null || !Number.isFinite(Number(ht)) || ht <= 0) {
    return { ok: false, error: `Montant HT manquant ou nul sur la ${course}.`, details: { delivery_id: d.id } };
  }
  const autoliq = d.autoliquidation === true;
  const lignes: LigneFacture[] = [];

  const taux = tauxLignePrincipale(ht, d.tva_cts, d.tva_rate);
  let code: string | null;
  if (autoliq) code = opts.codeAutoliquidation;
  else code = codeTvaLegal(taux);
  if (code === null) {
    return {
      ok: false,
      error: `Taux de TVA non légal (${String(taux).replace('.', ',')} %) sur la ${course} — `
        + 'taux acceptés : 0 ; 2,1 ; 5,5 ; 10 ; 20 %. Corrigez le taux ou le montant de TVA.',
      details: { delivery_id: d.id, tva_rate_pct: taux, tva_cts: d.tva_cts, amount_ht_cts: ht },
    };
  }
  const base = libelleCourse(d);
  const parColis = quantiteColis(d);
  lignes.push({
    ref: d.id,
    // La mention voyage DANS le libellé : seul endroit dont on soit certain
    // qu'il figure sur la facture imprimée.
    label: autoliq ? `${base} — ${opts.mentionAutoliquidation}` : base,
    quantity: parColis?.quantity ?? 1,
    amountHtCts: parColis?.unitCts ?? ht,
    vatCode: code,
    ratePct: autoliq ? null : taux,
  });

  const extras = Array.isArray(d.extra_lines) ? d.extra_lines as Array<Record<string, unknown>> : [];
  for (const [idx, raw] of extras.entries()) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    const qtyBrute = Number(raw?.quantity ?? 1);
    const qty = Number.isFinite(qtyBrute) && qtyBrute > 0 ? qtyBrute : 1;
    const extraHt = Number(raw?.amount_ht_cts ?? 0);
    const extraRate = raw?.tva_rate == null || raw.tva_rate === '' ? taux : Number(raw.tva_rate);
    if (!label) {
      return { ok: false, error: `Ligne supplémentaire n° ${idx + 1} sans libellé sur la ${course}.` };
    }
    if (!Number.isFinite(extraHt) || extraHt <= 0) {
      return { ok: false, error: `Ligne supplémentaire « ${label} » : montant HT invalide sur la ${course}.` };
    }
    let extraCode: string | null;
    if (autoliq) extraCode = opts.codeAutoliquidation;
    else extraCode = codeTvaLegal(extraRate);
    if (extraCode === null) {
      return {
        ok: false,
        error: `Ligne supplémentaire « ${label} » : taux de TVA non légal `
          + `(${String(extraRate).replace('.', ',')} %) sur la ${course}.`,
      };
    }
    lignes.push({
      ref: `${d.id}#extra-${idx}`,
      label,
      quantity: qty,
      amountHtCts: Math.round(extraHt),
      vatCode: extraCode,
      ratePct: autoliq ? null : extraRate,
    });
  }

  return { ok: true, lignes };
}
