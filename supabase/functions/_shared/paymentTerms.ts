// Miroir Deno de src/shared/lib/paymentTerms.ts (échéance uniquement — les
// Edge Functions ne peuvent pas importer le code front, hors arbre déployé).
// Seul `computeDeadline` est utilisé côté serveur (calcul de la date envoyée
// à Pennylane) ; l'entier `payment_terms` reste géré tel quel ailleurs.

export function computeDeadline(code: string | null | undefined, fromIso: string, fallbackDays: number): string {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  if (code === '30_fin_mois') {
    from.setUTCDate(from.getUTCDate() + 30);
    const endOfMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    return endOfMonth.toISOString().slice(0, 10);
  }
  const days = code === 'reception' ? 0
    : code === '15' ? 15
    : code === '30' ? 30
    : code === '45' ? 45
    : code === '60' ? 60
    : fallbackDays;
  from.setUTCDate(from.getUTCDate() + days);
  return from.toISOString().slice(0, 10);
}

/**
 * Échéance PLAFONNÉE au transport : L441-11 C. com. — 30 jours maximum à
 * compter de la date d'émission de la facture. Un ancien client à 45 / 60 j
 * ou « 30 j fin de mois » part donc à 30 j.
 */
export function echeanceTransport(code: string | null | undefined, fromIso: string, fallbackDays: number): string {
  const calculee = computeDeadline(code, fromIso, fallbackDays);
  const plafond = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  plafond.setUTCDate(plafond.getUTCDate() + 30);
  const max = plafond.toISOString().slice(0, 10);
  return calculee > max ? max : calculee;
}
