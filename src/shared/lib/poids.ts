/**
 * Poids d'un chargement — PUR (sans DB ni DOM), testable.
 *
 * Vit dans `shared/` parce que deux ecrans le reclament : le plan de
 * chargement du chauffeur et celui de la tournee cote bureau. Les features
 * etant etanches, c'est le seul endroit ou les deux peuvent puiser la meme
 * regle.
 */

export interface PoidsTotal {
  /** Somme des poids connus, en kilogrammes. */
  kg: number
  /** Courses dont le poids n'est pas renseigne. */
  nbSansPoids: number
  /** Y a-t-il au moins un poids connu ? Sinon il n'y a rien a afficher. */
  aUnPoids: boolean
}

/**
 * Poids total d'un lot de courses.
 *
 * Les courses sans poids sont COMPTEES A PART et jamais traitees comme des
 * zeros. « 340 kg » sur un lot dont la moitie n'est pas pesee se lirait comme
 * un total, alors que c'est un minimum — et sur un 3,5 t, la difference entre
 * les deux est exactement ce qui fait passer en surcharge.
 */
export function poidsTotal(courses: Array<{ weight_kg?: number | null }>): PoidsTotal {
  let kg = 0
  let nbSansPoids = 0
  let aUnPoids = false
  for (const c of courses) {
    if (c.weight_kg == null) { nbSansPoids += 1; continue }
    kg += c.weight_kg
    aUnPoids = true
  }
  return { kg, nbSansPoids, aUnPoids }
}

/** « 340 kg », ou « 340 kg + 2 non pesées » quand il manque des poids. */
export function libellePoids(p: PoidsTotal): string | null {
  if (!p.aUnPoids && p.nbSansPoids === 0) return null
  if (!p.aUnPoids) return `${p.nbSansPoids} course${p.nbSansPoids > 1 ? 's' : ''} non pesée${p.nbSansPoids > 1 ? 's' : ''}`
  const base = `${p.kg.toLocaleString('fr-FR')} kg`
  return p.nbSansPoids > 0
    ? `${base} + ${p.nbSansPoids} non pesée${p.nbSansPoids > 1 ? 's' : ''}`
    : base
}
