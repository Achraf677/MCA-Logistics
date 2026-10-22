/** Types de l'espace salarié « Mes courses » (fiche Équipe du compte). */

/**
 * Fiche Équipe du compte connecté, telle que l'espace salarié la lit (Ma journée, Moi).
 * Pas de salaire, pas de contrat : seulement ce qui le concerne au quotidien.
 * `tarif_*` et `clients_messagerie` viennent de la migration 20261012110000 : absents
 * (null / []) tant qu'elle n'est pas appliquée (`complete = false`).
 */
export interface MaFiche {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
  tarif_domicile_cts: number | null
  tarif_relais_cts: number | null
  clients_messagerie: string[]
  /** false = colonnes de la journée de colis absentes de la base. */
  complete: boolean
}

/** Lecture de la fiche, partagée par les onglets Ma journée et Moi. */
export interface EtatFiche {
  chargee: boolean
  /** null (chargée, sans erreur) = compte non relié à une fiche Équipe. */
  data: MaFiche | null
  erreur: string | null
}
