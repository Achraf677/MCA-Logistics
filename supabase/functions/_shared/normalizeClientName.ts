// Miroir Deno de src/shared/lib/normalizeClientName.ts (les Edge Functions ne
// peuvent pas importer le code front, hors arbre déployé).
export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}
