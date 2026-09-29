export interface ChargeCategoryRow {
  id: string
  company_id: string
  name: string
  slug: string
  type: string | null
  is_system: boolean
  /** false = masquée des listes de choix (reste sur les charges déjà classées). */
  actif?: boolean
  created_at: string
  updated_at: string
}

/** ChargeCategoryRow enrichi du nombre de charges liées (retourné par getCategories). */
export interface ChargeCategoryWithCount extends ChargeCategoryRow {
  charges: [{ count: string }] | []
}
