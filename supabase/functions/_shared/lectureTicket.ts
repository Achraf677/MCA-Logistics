// Lecture d'un ticket de dépense par l'IA — règles PURES (aucun Deno.*, aucun fetch), testées par vitest.
// L'IA ne décide de rien : elle propose, on borne, et on ne remplit que les cases VIDES du justificatif.

export const CATEGORIES_TICKET = ['carburant', 'peage', 'parking', 'repas', 'entretien', 'fournitures', 'autre'] as const;
export type CategorieTicket = typeof CATEGORIES_TICKET[number];

export const SEUIL_CONFIANCE = 0.7;
/** Un ticket de dépense courante : au-delà, c'est une lecture ratée ou un autre type de document. */
const MAX_TTC_CTS = 500_000;

export interface LectureBrute {
  fournisseur?: unknown; fournisseur_confiance?: unknown
  date?: unknown; date_confiance?: unknown
  total_ttc?: unknown; total_confiance?: unknown
  categorie?: unknown; categorie_confiance?: unknown
}

export interface Lecture {
  fournisseur: string | null
  date: string | null
  total_ttc_cts: number | null
  categorie: CategorieTicket | null
}

const sur = (c: unknown) => Number.isFinite(Number(c)) && Number(c) >= SEUIL_CONFIANCE;

/** Borne et filtre la réponse brute : un champ douteux ou invraisemblable revient `null` (jamais un chiffre plausible et faux). */
export function normaliserLecture(brut: LectureBrute | null | undefined, aujourdhui: string): Lecture {
  const b = brut ?? {};
  const nom = typeof b.fournisseur === 'string' ? b.fournisseur.trim().slice(0, 80) : '';
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date <= aujourdhui && b.date >= '2020-01-01' ? b.date : null;
  const ttc = Number(b.total_ttc);
  const cts = Number.isFinite(ttc) && ttc > 0 ? Math.round(ttc * 100) : null;
  const categorie = typeof b.categorie === 'string' && (CATEGORIES_TICKET as readonly string[]).includes(b.categorie) ? b.categorie as CategorieTicket : null;
  return {
    fournisseur: nom && sur(b.fournisseur_confiance) ? nom : null,
    date: date && sur(b.date_confiance) ? date : null,
    total_ttc_cts: cts != null && cts <= MAX_TTC_CTS && sur(b.total_confiance) ? cts : null,
    categorie: categorie && sur(b.categorie_confiance) ? categorie : null,
  };
}

const simple = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Fournisseur du site dont le nom correspond à celui lu (égal ou l'un contient l'autre, 4 lettres minimum) ; null si doute (2 candidats). */
export function fournisseurCorrespondant(lu: string | null, fournisseurs: Array<{ id: string; name: string }>): string | null {
  const n = simple(lu ?? '');
  if (n.length < 4) return null;
  const trouves = fournisseurs.filter(f => {
    const m = simple(f.name);
    return m.length >= 4 && (m === n || m.includes(n) || n.includes(m));
  });
  return trouves.length === 1 ? trouves[0].id : null;
}

export interface TicketLu {
  montant_ttc_cts?: number | null; date_depense?: string | null; categorie?: string | null
  supplier_id?: string | null
}

/** Colonnes à écrire : SEULEMENT celles qui sont vides sur le justificatif (ce que le salarié a saisi ne bouge jamais). */
export function colonnesAPrerempli(t: TicketLu, l: Lecture, fournisseurId: string | null): Record<string, unknown> {
  const maj: Record<string, unknown> = {};
  if (t.montant_ttc_cts == null && l.total_ttc_cts != null) maj.montant_ttc_cts = l.total_ttc_cts;
  if (t.date_depense == null && l.date != null) maj.date_depense = l.date;
  if (t.categorie == null && l.categorie != null) maj.categorie = l.categorie;
  if (t.supplier_id == null && fournisseurId != null) maj.supplier_id = fournisseurId;
  return maj;
}
