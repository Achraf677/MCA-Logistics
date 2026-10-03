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
  return assembler(d, opts, {
    objet: `la course du ${jourFr(d.date)}`,
    libelle: libelleCourse(d),
    parUnite: quantiteColis(d),
    taux: tauxLignePrincipale(Number(d.amount_ht_cts), d.tva_cts, d.tva_rate),
    cleId: 'delivery_id',
  });
}

/** Contexte de la ligne principale : ce qui distingue une course d'un devis. */
interface Principale {
  /** « la course du 19/07/2026 » / « le devis du … » — pour les messages d'erreur. */
  objet: string;
  libelle: string;
  /** Quantité × prix unitaire envoyés à Pennylane ; null = 1 × HT. */
  parUnite: { quantity: number; unitCts: number } | null;
  taux: number;
  /** Clé de l'id dans `details` des refus. */
  cleId: 'delivery_id' | 'quote_id';
}

function assembler(
  d: Pick<CourseAFacturer, 'id' | 'amount_ht_cts' | 'autoliquidation' | 'extra_lines'>,
  opts: { codeAutoliquidation: string; mentionAutoliquidation: string },
  p: Principale,
): ResultatLignes {
  const course = p.objet;
  const ht = d.amount_ht_cts;
  if (ht == null || !Number.isFinite(Number(ht)) || ht <= 0) {
    return { ok: false, error: `Montant HT manquant ou nul sur ${course}.`, details: { [p.cleId]: d.id } };
  }
  const autoliq = d.autoliquidation === true;
  const lignes: LigneFacture[] = [];

  const taux = p.taux;
  let code: string | null;
  if (autoliq) code = opts.codeAutoliquidation;
  else code = codeTvaLegal(taux);
  if (code === null) {
    return {
      ok: false,
      error: `Taux de TVA non légal (${String(taux).replace('.', ',')} %) sur ${course} — `
        + 'taux acceptés : 0 ; 2,1 ; 5,5 ; 10 ; 20 %. Corrigez le taux ou le montant de TVA.',
      details: { [p.cleId]: d.id, tva_rate_pct: taux, amount_ht_cts: ht },
    };
  }
  const base = p.libelle;
  const parColis = p.parUnite;
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
      return { ok: false, error: `Ligne supplémentaire n° ${idx + 1} sans libellé sur ${course}.` };
    }
    if (!Number.isFinite(extraHt) || extraHt <= 0) {
      return { ok: false, error: `Ligne supplémentaire « ${label} » : montant HT invalide sur ${course}.` };
    }
    let extraCode: string | null;
    if (autoliq) extraCode = opts.codeAutoliquidation;
    else extraCode = codeTvaLegal(extraRate);
    if (extraCode === null) {
      return {
        ok: false,
        error: `Ligne supplémentaire « ${label} » : taux de TVA non légal `
          + `(${String(extraRate).replace('.', ',')} %) sur ${course}.`,
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

// ── Devis (lot U3) : mêmes lignes que la facture ─────────────────────────────

/** Devis tel que lu en base (fiche de prix, migration 20261002090000). */
export interface DevisAFacturer {
  id: string;
  date: string | null;
  description: string | null;
  reference_client?: string | null;
  prestation?: string | null;
  /** Quantité de la ligne principale (colis, km, palettes, forfaits). */
  quantite?: number | string | null;
  /** Prix unitaire HT ; null = ancien devis (montant global seul). */
  prix_unitaire_cts?: number | null;
  /** TOTAUX du devis (ligne principale + suppléments). */
  amount_ht_cts: number | null;
  tva_cts: number | null;
  /** Un seul taux pour tout le devis. */
  tva_rate: number | string | null;
  autoliquidation: boolean | null;
  extra_lines: unknown;
}

function qte(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** HT des suppléments d'un devis (quantité × HT unitaire, arrondi par ligne). */
function supplementsHtCts(extra: unknown): number {
  const lignes = Array.isArray(extra) ? extra as Array<Record<string, unknown>> : [];
  return lignes.reduce((s, l) => s + Math.round(qte(l?.quantity) * (Number(l?.amount_ht_cts) || 0)), 0);
}

/**
 * Libellé de la ligne principale d'un devis : celui de la facture
 * (`libelleCourse` : description, sinon défaut, puis « — Réf. … »), sauf en
 * messagerie où le défaut de facture (« colis livrés » d'un mois) n'a pas de
 * sens pour une proposition de prix.
 */
export function libelleDevis(
  q: Pick<DevisAFacturer, 'description' | 'date' | 'reference_client' | 'prestation'>,
): string {
  if (q.prestation === 'messagerie' && !q.description?.trim()) {
    const ref = q.reference_client?.trim();
    return ref ? `Messagerie — prix au colis — Réf. ${ref}` : 'Messagerie — prix au colis';
  }
  return libelleCourse({ ...q, type: null });
}

/**
 * Ligne principale d'un devis : quantité × prix unitaire (fiche de prix) ;
 * ancien devis (sans prix unitaire) = 1 × (HT total − suppléments).
 */
export function principaleDevis(
  q: Pick<DevisAFacturer, 'quantite' | 'prix_unitaire_cts' | 'amount_ht_cts' | 'extra_lines'>,
): { htCts: number; parUnite: { quantity: number; unitCts: number } | null } {
  if (q.prix_unitaire_cts != null && Number.isFinite(Number(q.prix_unitaire_cts))) {
    const quantity = qte(q.quantite);
    const unitCts = Math.round(Number(q.prix_unitaire_cts));
    return { htCts: Math.round(quantity * unitCts), parUnite: { quantity, unitCts } };
  }
  return { htCts: Number(q.amount_ht_cts ?? 0) - supplementsHtCts(q.extra_lines), parUnite: null };
}

/**
 * Taux du devis : le taux stocké s'il est légal (le devis n'a qu'un taux) ;
 * sinon déduit des TOTAUX (ancien devis), comme pour une course.
 */
export function tauxDevis(q: Pick<DevisAFacturer, 'amount_ht_cts' | 'tva_cts' | 'tva_rate'>): number {
  const stocke = q.tva_rate != null && q.tva_rate !== '' ? Number(q.tva_rate) : null;
  if (stocke != null && codeTvaLegal(stocke) !== null) return stocke;
  return tauxLignePrincipale(Number(q.amount_ht_cts ?? 0), q.tva_cts, q.tva_rate);
}

/**
 * Lignes Pennylane d'un devis — MÊMES règles que `construireLignes` (codes TVA
 * légaux, autoliquidation sur toutes les lignes + mention, suppléments, refus
 * lisibles). La facture issue du devis (`create_from_quote`) recopie ces lignes.
 */
export function construireLignesDevis(
  q: DevisAFacturer,
  opts: { codeAutoliquidation: string; mentionAutoliquidation: string },
): ResultatLignes {
  const taux = tauxDevis(q);
  const principale = principaleDevis(q);
  const extras = (Array.isArray(q.extra_lines) ? q.extra_lines as Array<Record<string, unknown>> : [])
    // Un supplément de devis suit le taux du devis.
    .map((l) => ({ ...l, tva_rate: l?.tva_rate ?? taux }));
  return assembler(
    { id: q.id, amount_ht_cts: principale.htCts, autoliquidation: q.autoliquidation, extra_lines: extras },
    opts,
    {
      objet: `le devis du ${jourFr(q.date)}`,
      libelle: libelleDevis(q),
      parUnite: principale.parUnite,
      taux,
      cleId: 'quote_id',
    },
  );
}
