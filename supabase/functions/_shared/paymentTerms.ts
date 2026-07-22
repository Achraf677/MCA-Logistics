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
