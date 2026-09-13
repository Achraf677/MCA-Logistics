/**
 * Les ARRÊTS d'une journée — PUR (sans DB ni DOM), testable.
 *
 * Le malentendu que ce module corrige : une course a été traitée jusqu'ici
 * comme UN point sur la route, alors qu'elle en compte DEUX — on va chercher,
 * puis on livre. Tant que l'ordre portait sur les courses, une journée comme
 * « je charge chez A, je charge chez B, je livre A, je livre B » était
 * inexprimable : le retrait et la livraison d'une même course restaient collés.
 *
 * Ici, l'unité est l'ARRÊT. Une course en produit un ou deux, et c'est la
 * liste des arrêts qui s'ordonne.
 */

export type TypeArret = 'retrait' | 'livraison'

/** Ce qu'une course doit fournir pour être découpée en arrêts. */
export interface CoursePourArrets {
  id: string
  pickup_address: string | null
  delivery_address: string | null
  /** Position de l'arrêt de RETRAIT dans la séquence du jour. */
  pickup_order: number | null
  /** Position de l'arrêt de LIVRAISON dans la même séquence. */
  stop_order: number | null
  /** Horodatage du chargement : le retrait est fait. */
  charge_le: string | null
  statut: string
}

export interface ArretJour<T extends CoursePourArrets> {
  /** `${courseId}:${type}` — stable, sert de clé React et de cible de déplacement. */
  cle: string
  courseId: string
  type: TypeArret
  adresse: string
  ordre: number | null
  /** L'arrêt est-il derrière nous ? */
  fait: boolean
  course: T
}

/** Statuts pour lesquels il ne reste plus rien à faire sur la route. */
const STATUTS_CLOS = new Set(['livree', 'facturee', 'payee', 'annulee'])

/**
 * Découpe les courses d'une journée en arrêts, dans l'ordre de la route.
 *
 * Un arrêt de RETRAIT n'existe que s'il y a une adresse où aller : une course
 * qui part du dépôt, marchandise déjà chargée, n'en produit pas. Un arrêt de
 * LIVRAISON existe toujours, même sans adresse — c'est ce qui rend le manque
 * visible plutôt que silencieux.
 *
 * ORDRE : les arrêts jamais ordonnés passent APRÈS ceux qui le sont. Sinon une
 * course ajoutée en cours de journée viendrait se planter en tête d'une
 * journée déjà organisée. À égalité, le retrait passe avant sa propre
 * livraison — on ne livre pas ce qu'on n'a pas chargé.
 */
export function arretsDuJour<T extends CoursePourArrets>(courses: T[]): Array<ArretJour<T>> {
  const arrets: Array<ArretJour<T>> = []

  for (const c of courses) {
    const close = STATUTS_CLOS.has(c.statut)

    if (c.pickup_address?.trim()) {
      arrets.push({
        cle: `${c.id}:retrait`,
        courseId: c.id,
        type: 'retrait',
        adresse: c.pickup_address.trim(),
        ordre: c.pickup_order,
        fait: close || c.charge_le != null,
        course: c,
      })
    }

    arrets.push({
      cle: `${c.id}:livraison`,
      courseId: c.id,
      type: 'livraison',
      adresse: c.delivery_address?.trim() ?? '',
      ordre: c.stop_order,
      fait: close,
      course: c,
    })
  }

  return arrets.sort(comparerArrets)
}

function comparerArrets(a: ArretJour<CoursePourArrets>, b: ArretJour<CoursePourArrets>): number {
  const oa = a.ordre ?? Number.MAX_SAFE_INTEGER
  const ob = b.ordre ?? Number.MAX_SAFE_INTEGER
  if (oa !== ob) return oa - ob
  // Même position (ou aucune) : le retrait d'une course passe avant sa
  // livraison. On ne livre pas ce qu'on n'a pas chargé.
  if (a.courseId === b.courseId) return a.type === 'retrait' ? -1 : 1
  return 0
}

/**
 * Déplace un arrêt d'un cran et renvoie la nouvelle séquence.
 *
 * Renvoie le tableau INCHANGÉ (même référence) quand le mouvement est
 * impossible — premier vers le haut, dernier vers le bas, clé inconnue — pour
 * que l'appelant puisse comparer et n'écrire en base que si quelque chose a
 * bougé.
 */
export function deplacerArretJour<T extends CoursePourArrets>(
  arrets: Array<ArretJour<T>>,
  cle: string,
  sens: 'haut' | 'bas',
): Array<ArretJour<T>> {
  const i = arrets.findIndex(a => a.cle === cle)
  if (i === -1) return arrets
  const j = sens === 'haut' ? i - 1 : i + 1
  if (j < 0 || j >= arrets.length) return arrets
  const copie = [...arrets]
  copie[i] = arrets[j]
  copie[j] = arrets[i]
  return copie
}

/**
 * Traduit une séquence d'arrêts en positions à écrire, course par course.
 *
 * Une course peut recevoir l'une des deux positions, ou les deux. Les
 * numéros partent de 1 et suivent la séquence affichée — c'est la même
 * séquence pour les retraits et les livraisons, c'est tout l'intérêt.
 */
export function positionsAEcrire<T extends CoursePourArrets>(
  arrets: Array<ArretJour<T>>,
): Array<{ courseId: string; pickup_order?: number; stop_order?: number }> {
  const par = new Map<string, { courseId: string; pickup_order?: number; stop_order?: number }>()
  arrets.forEach((a, i) => {
    const ligne = par.get(a.courseId) ?? { courseId: a.courseId }
    if (a.type === 'retrait') ligne.pickup_order = i + 1
    else ligne.stop_order = i + 1
    par.set(a.courseId, ligne)
  })
  return [...par.values()]
}
