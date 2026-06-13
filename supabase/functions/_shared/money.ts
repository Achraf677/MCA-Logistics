// Miroir Deno de la conversion centimes → euros de src/shared/lib/money.ts.
// Les Edge Functions ne peuvent pas importer le code front (hors arbre déployé) :
// on garde ici la même fonction pure, source unique côté serveur.
export function centimesToEuros(cts: number): number {
  return cts / 100;
}
