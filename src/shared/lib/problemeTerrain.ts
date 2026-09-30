/**
 * Problème signalé sur le terrain par le chauffeur — PUR, sans DB ni DOM.
 *
 * Partagé : « Mes courses » l'écrit, la cloche d'alertes et le bureau le
 * lisent. Le statut de la course n'est PAS touché par un signalement : la
 * course reste ouverte et le bureau décide (relivraison, retour dépôt,
 * annulation). Mêmes valeurs que la contrainte `deliveries.probleme_motif`.
 */

export const MOTIFS_PROBLEME = [
  'absent', 'refus', 'adresse_introuvable', 'acces_impossible', 'endommage', 'autre',
] as const

export type MotifProbleme = typeof MOTIFS_PROBLEME[number]

export const LIBELLE_MOTIF: Record<MotifProbleme, string> = {
  absent: 'Absent',
  refus: 'Refus',
  adresse_introuvable: 'Adresse introuvable',
  acces_impossible: 'Accès impossible',
  endommage: 'Marchandise endommagée',
  autre: 'Autre',
}

export function libelleMotif(m: string | null | undefined): string {
  return m && m in LIBELLE_MOTIF ? LIBELLE_MOTIF[m as MotifProbleme] : 'Problème'
}

/** Une course a un problème EN ATTENTE tant qu'elle est ouverte et signalée. */
export function aProblemeOuvert(c: { statut: string; probleme_le: string | null }): boolean {
  return c.probleme_le != null && (c.statut === 'planifiee' || c.statut === 'en_cours')
}
