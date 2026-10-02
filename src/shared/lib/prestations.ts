// Types de prestation de MCA (deliveries.prestation, quotes.prestation).
// Partagé : fiche livraison, devis.

/**
 * Type de prestation — décide des blocs de la fiche. `null` (anciennes
 * courses) se lit comme `express`.
 */
export type Prestation = 'express' | 'messagerie' | 'dediee' | 'mise_a_dispo' | 'forfait'

export const PRESTATIONS: Prestation[] = ['express', 'messagerie', 'dediee', 'mise_a_dispo', 'forfait']

export const PRESTATION_LABELS: Record<Prestation, string> = {
  express:      'Express',
  messagerie:   'Messagerie',
  dediee:       'Course dédiée',
  mise_a_dispo: 'Mise à disposition',
  forfait:      'Forfait / relevé',
}

export const PRESTATION_AIDES: Record<Prestation, string> = {
  express:      'Une course : un retrait, une livraison, souvent dans la journée.',
  messagerie:   'Relevé du mois : nombre de colis livrés × prix au colis. Rien d’autre à saisir.',
  dediee:       'Véhicule réservé pour un client, prix au forfait.',
  mise_a_dispo: 'Véhicule et chauffeur à disposition sur un lieu, à l’heure ou à la journée.',
  forfait:      'Facturation globale (mois, période) : aucun arrêt à saisir.',
}
