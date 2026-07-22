// Logique pure de gestion des catégories de charges — PUR, sans DB ni DOM.
// L'accès DB (insert réel, contrainte UNIQUE (company_id, slug) en dernier
// rempart contre les races) vit dans categories.queries.ts, qui délègue le
// calcul du slug à slugifyCategoryName ci-dessous.

/** Slug stable : accents supprimés, minuscules, tout non [a-z0-9] → '_', pas de
 *  '_' en tête/queue. Ex : "Réparation moteur" → "reparation_moteur". */
export function slugifyCategoryName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** true si `slug` existe déjà parmi les catégories fournies. */
export function isDuplicateCategorySlug(
  slug: string,
  existing: { slug: string }[],
): boolean {
  return existing.some(c => c.slug === slug)
}

export interface CreateCategorieInput {
  name: string
  type?: string | null
}

export interface PrepareCategorieResult {
  ok: boolean
  /** Nom nettoyé (trim) — présent uniquement si ok. */
  name?: string
  /** Slug calculé — présent uniquement si ok. */
  slug?: string
  /** Message d'erreur lisible — présent uniquement si !ok. */
  error?: string
}

/**
 * Valide + calcule le slug d'une nouvelle catégorie AVANT l'appel DB — retour
 * instantané côté UI (nom trop court, doublon local). La contrainte UNIQUE
 * (company_id, slug) en base reste le garde-fou final contre les races
 * concurrentes (deux créations simultanées du même nom).
 */
export function prepareCategorieCreation(
  input: CreateCategorieInput,
  existing: { slug: string }[],
): PrepareCategorieResult {
  const name = (input.name ?? '').trim()
  if (name.length < 2) return { ok: false, error: 'Le nom doit contenir au moins 2 caractères' }

  const slug = slugifyCategoryName(name)
  if (!slug) return { ok: false, error: 'Nom invalide' }

  if (isDuplicateCategorySlug(slug, existing)) {
    return { ok: false, error: `Une catégorie « ${name} » existe déjà` }
  }

  return { ok: true, name, slug }
}
