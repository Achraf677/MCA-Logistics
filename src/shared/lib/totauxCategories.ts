// Répartition des dépenses par catégorie — PUR (sans DB ni DOM), testable.
//
// Une charge peut compter dans PLUSIEURS catégories : une facture de station
// contient du lave-glace et de l'AdBlue, ventilés en sous-lignes
// (charge_allocations, chacune avec sa propre category_id). Sommer
// bêtement `charges.montant_ttc_cts` par `charges.category_id` écraserait cette
// décomposition et attribuerait toute la facture à une seule catégorie.
//
// Règle appliquée à chaque charge :
//   1. chaque ligne de ventilation va dans SA catégorie (à défaut, celle de la charge) ;
//   2. le reliquat non ventilé va dans la catégorie de la charge.
// Une charge sans ventilation tombe entièrement dans le cas 2 — le comportement
// d'avant, préservé.
//
// Les charges sans catégorie sont conservées sous la clé `null` : les masquer
// ferait un total inférieur aux dépenses réelles, ce qui est pire que de montrer
// une ligne « Sans catégorie » à traiter.

export interface ChargePourTotaux {
  id: string
  category_id: string | null
  montant_ttc_cts: number | null
}

export interface AllocationPourTotaux {
  charge_id: string
  category_id: string | null
  amount_cts: number
}

/** Somme d'une ligne, en ignorant les valeurs non finies ou ≤ 0 (invariant du CHECK SQL). */
function montantValide(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Total dépensé par catégorie, en centimes.
 * Clé `null` = charges (ou parts de charges) sans catégorie.
 */
export function totauxParCategorie(
  charges: ChargePourTotaux[],
  allocations: AllocationPourTotaux[],
): Map<string | null, number> {
  // Regroupe les ventilations par charge, une seule fois.
  const parCharge = new Map<string, AllocationPourTotaux[]>()
  for (const a of allocations) {
    if (!a.charge_id) continue
    const liste = parCharge.get(a.charge_id)
    if (liste) liste.push(a)
    else parCharge.set(a.charge_id, [a])
  }

  const totaux = new Map<string | null, number>()
  const ajoute = (categorie: string | null, cts: number) => {
    if (cts <= 0) return
    totaux.set(categorie, (totaux.get(categorie) ?? 0) + cts)
  }

  for (const c of charges) {
    const total = montantValide(c.montant_ttc_cts)
    if (total === 0) continue

    const lignes = parCharge.get(c.id) ?? []
    let ventile = 0
    for (const l of lignes) {
      const part = montantValide(l.amount_cts)
      if (part === 0) continue
      ventile += part
      ajoute(l.category_id ?? c.category_id, part)
    }

    // Reliquat non ventilé : rattaché à la catégorie de la charge.
    // Négatif possible si sur-ventilation — on ne retranche jamais, sinon un
    // total deviendrait faux à cause d'une saisie aberrante.
    const reliquat = total - ventile
    if (reliquat > 0) ajoute(c.category_id, reliquat)
  }

  return totaux
}

export interface LigneTotalCategorie {
  category_id: string | null
  /** Nom affichable ; « Sans catégorie » quand `category_id` est null. */
  nom: string
  total_cts: number
  /** Part du total général, entre 0 et 1. 0 si le total général est nul. */
  part: number
}

/**
 * Met en forme les totaux pour l'affichage : nom résolu, part du total,
 * tri décroissant. « Sans catégorie » est toujours renvoyé en dernier, quel
 * que soit son montant : c'est un reste à traiter, pas un poste de dépense.
 */
export function lignesTotauxCategories(
  totaux: Map<string | null, number>,
  nomsParId: Map<string, string>,
): LigneTotalCategorie[] {
  const general = [...totaux.values()].reduce((s, v) => s + v, 0)

  const lignes: LigneTotalCategorie[] = [...totaux.entries()].map(([category_id, total_cts]) => ({
    category_id,
    nom: category_id === null
      ? 'Sans catégorie'
      : nomsParId.get(category_id) ?? 'Catégorie supprimée',
    total_cts,
    part: general > 0 ? total_cts / general : 0,
  }))

  return lignes.sort((a, b) => {
    if (a.category_id === null) return 1
    if (b.category_id === null) return -1
    return b.total_cts - a.total_cts
  })
}
