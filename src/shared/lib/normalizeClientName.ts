/** Normalise un nom de client : trim, espaces multiples → 1, MAJUSCULES.
 *  Appliqué à la création/édition locale ET aux noms entrants Pennylane —
 *  jamais de renommage rétroactif en masse (voir migration/CSS pour l'existant). */
export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}
