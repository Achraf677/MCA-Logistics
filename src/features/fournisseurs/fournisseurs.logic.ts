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
