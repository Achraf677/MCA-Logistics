// Suivi des justificatifs « Carte carburant » par mois et par véhicule — PUR, testé.
// Informatif : ces tickets ne vont PAS à Pennylane (facture mensuelle de la carte reçue en fin de mois).

export interface LigneCarburant {
  statut: string
  moyen_paiement?: string | null
  montant_ttc_cts?: number | null
  date_depense?: string | null
  vehicle_id?: string | null
  created_at: string
}

/** Un plein saisi à la main (pas de justificatif) vu comme une ligne de suivi : même mois, mêmes totaux. */
export function pleinManuelEnLigne<T extends { id: string; vehicle_id: string; date_plein: string; montant_ttc_cts: number; carte: string | null; note: string | null; created_at: string; litres?: number | null; prix_litre?: number | null; fait_par?: string | null }>(p: T) {
  return {
    id: p.id, statut: 'traite', moyen_paiement: 'carte_carburant', montant_ttc_cts: p.montant_ttc_cts, date_depense: p.date_plein,
    vehicle_id: p.vehicle_id, created_at: p.created_at, carte: p.carte, note: p.note, manuel: true as const,
    litres: p.litres ?? null, prix_litre: p.prix_litre ?? null, fait_par: p.fait_par ?? null,
  }
}

/** « 45,2 » / « 1,789 » → nombre ; '' → null ; invalide (lettres, trop de décimales) → NaN. */
export function decimalSaisi(v: string, maxDecimales: number): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDecimales}})?$`).test(t)) return Number.NaN
  return Number(t)
}

/** Montant TTC d'un plein en centimes = litres × prix au litre (calcul en entiers, pas de dérive des virgules). */
export function montantPleinCts(litres: number, prixLitre: number): number {
  return Math.round((Math.round(litres * 100) * Math.round(prixLitre * 1000)) / 1000)
}

export const SANS_VEHICULE = 'sans-vehicule'

const jourDe = (t: Pick<LigneCarburant, 'date_depense' | 'created_at'>) => t.date_depense ?? t.created_at.slice(0, 10)

/** Les justificatifs carte carburant VALIDÉS : tant qu'un ticket est dans « À traiter » (ou refusé) il ne compte pas. */
export function ticketsCarburant<T extends LigneCarburant>(tickets: T[]): T[] {
  return tickets.filter(t => t.moyen_paiement === 'carte_carburant' && t.statut === 'traite')
}

/** Les pleins d'un mois (« AAAA-MM »), du plus récent au plus ancien. */
export function pleinsDuMois<T extends LigneCarburant>(tickets: T[], mois: string): T[] {
  return ticketsCarburant(tickets)
    .filter(t => jourDe(t).startsWith(mois))
    .sort((a, b) => jourDe(b).localeCompare(jourDe(a)) || b.created_at.localeCompare(a.created_at))
}

export interface TotalVehicule { cle: string; libelle: string; nb: number; totalCts: number; partPct: number }

/** Total et nombre de pleins par véhicule (le plus dépensé d'abord), « Véhicule non précisé » en dernier. */
export function totauxParVehicule<T extends LigneCarburant>(pleins: T[], nomVehicule: (id: string) => string): TotalVehicule[] {
  const map = new Map<string, { nb: number; totalCts: number }>()
  for (const p of pleins) {
    const cle = p.vehicle_id || SANS_VEHICULE
    const m = map.get(cle) ?? { nb: 0, totalCts: 0 }
    m.nb += 1
    m.totalCts += p.montant_ttc_cts ?? 0
    map.set(cle, m)
  }
  const total = [...map.values()].reduce((s, m) => s + m.totalCts, 0)
  return [...map.entries()]
    .map(([cle, m]) => ({
      cle, libelle: cle === SANS_VEHICULE ? 'Véhicule non précisé' : nomVehicule(cle), nb: m.nb, totalCts: m.totalCts,
      partPct: total > 0 ? Math.round((m.totalCts / total) * 100) : 0,
    }))
    .sort((a, b) => (a.cle === SANS_VEHICULE ? 1 : b.cle === SANS_VEHICULE ? -1 : b.totalCts - a.totalCts))
}

/** « 2026-10 » + delta mois → « 2026-11 ». */
export function moisDecale(mois: string, delta: number): string {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const moisDe = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Litres des pleins qui en ont (les tickets n'en portent pas). */
export const totalLitres = (pleins: object[]): number => pleins.reduce<number>((s, p) => s + ((p as { litres?: number | null }).litres ?? 0), 0)

export const totalPleins = (pleins: LigneCarburant[]): number => pleins.reduce((s, p) => s + (p.montant_ttc_cts ?? 0), 0)

/** Ligne CSV (séparateur « ; », virgule décimale) pour garder une trace hors du site. */
export function csvCarburant<T extends LigneCarburant & { carte?: string | null }>(
  pleins: T[], nomVehicule: (id: string) => string, libelleCarte: (c: string | null | undefined) => string, declarant: (t: T) => string,
): string {
  const lignes = ['Date;Véhicule;Carte;Déclarant;Montant TTC']
  for (const p of [...pleins].reverse()) {
    const cts = p.montant_ttc_cts
    lignes.push([
      jourDe(p), p.vehicle_id ? nomVehicule(p.vehicle_id) : 'Non précisé', libelleCarte(p.carte), declarant(p),
      cts != null ? (cts / 100).toFixed(2).replace('.', ',') : '',
    ].join(';'))
  }
  return lignes.join('\n')
}
