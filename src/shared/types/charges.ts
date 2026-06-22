// Type minimal pour les sélecteurs de rapprochement charge<->opérationnel.
// Zéro import cross-feature : ce type vit dans shared/.
export interface ChargePick {
  id: string
  date: string
  label: string
  montant_ht_cts: number
  montant_ttc_cts: number | null
  tva_cts: number | null
  tva_rate: number
  receipt_url: string | null
  pennylane_id?: string | null
  supplier_id: string | null
  category_id: string | null
  charge_categories: { name: string; slug: string; type: string | null } | null
  suppliers: { name: string } | null
}
