// Miroir Deno de src/shared/lib/clientSyncMerge.ts (les Edge Functions ne
// peuvent pas importer le code front, hors arbre déployé). Voir ce fichier
// pour le contexte complet du bug corrigé ("local wins").

export interface ClientEnrichedFields {
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
}

export function mergeClientField(
  pennylaneValue: string | null | undefined,
  localValue: string | null | undefined,
): string | null {
  const p = (pennylaneValue ?? '').trim();
  if (p.length > 0) return p;
  return localValue ?? null;
}

export function mergeClientEnrichedFields(
  pennylane: ClientEnrichedFields,
  local: ClientEnrichedFields | null | undefined,
): ClientEnrichedFields {
  return {
    email:       mergeClientField(pennylane.email, local?.email),
    phone:       mergeClientField(pennylane.phone, local?.phone),
    address:     mergeClientField(pennylane.address, local?.address),
    city:        mergeClientField(pennylane.city, local?.city),
    postal_code: mergeClientField(pennylane.postal_code, local?.postal_code),
  };
}
