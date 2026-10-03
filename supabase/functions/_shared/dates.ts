// Dates « du jour » côté Edge — PUR (aucun import, aucun Deno.env), testé par vitest.
//
// Les Edge tournent en UTC : `toISOString().slice(0, 10)` donne la VEILLE entre
// 0 h et 2 h (heure de Paris). Toute date envoyée à Pennylane ou écrite comme
// « jour » passe par ici (lot U5, mca-spec/UNIFORMISATION-PENNYLANE.md).

/** Jour calendaire à Paris (AAAA-MM-JJ) de l'instant donné (maintenant par défaut). */
export function jourParis(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(instant);
}

/** Année civile à Paris (le 31/12 à 23 h 30, heure de Paris, reste dans l'année). */
export function anneeParis(instant: Date = new Date()): number {
  return Number(jourParis(instant).slice(0, 4));
}

/**
 * Jour à Paris d'un horodatage ISO stocké (ex. `deliveries.paid_at`), sinon null.
 * Une simple date AAAA-MM-JJ est rendue telle quelle.
 */
export function jourParisDe(horodatage: string | null | undefined): string | null {
  if (!horodatage) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(horodatage)) return horodatage;
  const d = new Date(horodatage);
  return Number.isNaN(d.getTime()) ? null : jourParis(d);
}

/**
 * Horodatage à écrire pour un JOUR connu sans heure (date d'un paiement lu chez
 * Pennylane) : midi UTC, qui reste le même jour à Paris quelle que soit la saison.
 */
export function horodatageDuJour(jour: string): string {
  return `${jour}T12:00:00.000Z`;
}
