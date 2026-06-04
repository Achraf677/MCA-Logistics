import type { Supplier } from './fournisseurs.types'

export const CATEGORY_LABELS: Record<NonNullable<Supplier['category']>, string> = {
  carburant:      'Carburant',
  assurance:      'Assurance',
  entretien:      'Entretien',
  soustraitance:  'Sous-traitance',
  logiciel:       'Logiciel',
  telecom:        'Télécom',
  autre:          'Autre',
}

export function getCategoryLabel(cat: Supplier['category']): string {
  return cat ? CATEGORY_LABELS[cat] : '—'
}

export function isTvaDeductible(cat: Supplier['category']): boolean {
  return cat === 'carburant'
}

export function countByCategory(suppliers: Supplier[]): Record<string, number> {
  return suppliers.reduce((acc, s) => {
    const key = s.category ?? 'autre'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}

/** Retire tous les caractères non-numériques et garde les 9 premiers chiffres. */
export function normalizeSiren(v: string): string {
  return v.replace(/\D/g, '').slice(0, 9)
}

/** Retourne true si v contient exactement 9 chiffres (après normalisation). */
export function validateSiren(v: string): boolean {
  return normalizeSiren(v).length === 9
}

/** Retourne true si v contient exactement 14 chiffres (après retrait des séparateurs). */
export function validateSiret(v: string): boolean {
  return v.replace(/\D/g, '').length === 14
}

/**
 * Cherche parmi `existing` un fournisseur dont le SIREN normalisé correspond à `siren`.
 * Si `excludeId` est fourni, ce fournisseur est ignoré (modification en cours).
 * Retourne null si `siren` ne forme pas 9 chiffres ou si aucun doublon n'est trouvé.
 */
export function findDuplicate(
  siren: string,
  existing: Supplier[],
  excludeId?: string,
): Supplier | null {
  const norm = normalizeSiren(siren)
  if (norm.length !== 9) return null
  return (
    existing.find(s => {
      if (excludeId && s.id === excludeId) return false
      // Préfère le champ siren dédié, sinon extrait les 9 premiers chiffres du siret.
      const cmp = s.siren
        ? normalizeSiren(s.siren)
        : s.siret
          ? normalizeSiren(s.siret)
          : ''
      return cmp.length === 9 && cmp === norm
    }) ?? null
  )
}
