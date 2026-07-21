// Parsing DÉFENSIF de la réponse de l'Edge `suggest-categorie-ia` — pur, testé.
// L'Edge applique déjà le seuil de confiance, mais le front revalide : la
// category_id doit exister dans la liste locale des catégories (l'Edge et le
// front peuvent avoir des listes désynchronisées), la confiance doit être un
// nombre 0..1 ≥ seuil. Tout écart → pas de suggestion (null), jamais d'erreur.

export const SEUIL_CONFIANCE_IA = 0.7

export interface SuggestionIa {
  category_id: string | null
  confiance: number
}

/**
 * Interprète la réponse brute de l'Edge (data éventuellement malformée).
 * Renvoie toujours un objet exploitable : { category_id: null } en cas de
 * doute (id inconnu, confiance basse, structure inattendue).
 */
export function parseSuggestionIa(
  raw: unknown,
  categories: { id: string }[],
  seuil: number = SEUIL_CONFIANCE_IA,
): SuggestionIa {
  if (!raw || typeof raw !== 'object') return { category_id: null, confiance: 0 }
  const r = raw as { category_id?: unknown; confiance?: unknown }

  const confiance = Number(r.confiance)
  const safeConfiance = Number.isFinite(confiance) && confiance >= 0 && confiance <= 1
    ? confiance
    : 0

  const id = typeof r.category_id === 'string' ? r.category_id : null
  if (!id) return { category_id: null, confiance: safeConfiance }

  const exists = categories.some(c => c.id === id)
  if (!exists) return { category_id: null, confiance: safeConfiance }
  if (safeConfiance < seuil) return { category_id: null, confiance: safeConfiance }

  return { category_id: id, confiance: safeConfiance }
}
