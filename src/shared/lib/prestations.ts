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

export interface BlocsPrestation {
  /** Relevé de messagerie : mois + nombre de colis × prix au colis, rien d'autre. */
  releve: boolean
  /** Bloc « Retrait » affiché. */
  retrait: boolean
  /** Bloc « Livraison » (ou « Lieu ») affiché. */
  livraison: boolean
  /** Titre du bloc livraison. */
  titreLivraison: string
  /** L'adresse de livraison / du lieu est exigée pour partir. */
  adresseExigee: boolean
  /** Le bloc marchandise est pertinent. */
  marchandise: boolean
  /** Le chauffeur et le véhicule sont exigés pour partir. */
  execution: boolean
}

export function blocsPrestation(p: Prestation | null | undefined): BlocsPrestation {
  switch (p ?? 'express') {
    case 'messagerie':
      return { releve: true, retrait: false, livraison: false, titreLivraison: 'Livraison', adresseExigee: false, marchandise: false, execution: false }
    case 'forfait':
      return { releve: false, retrait: false, livraison: false, titreLivraison: 'Livraison', adresseExigee: false, marchandise: false, execution: false }
    case 'mise_a_dispo':
      return { releve: false, retrait: false, livraison: true, titreLivraison: 'Lieu de mise à disposition', adresseExigee: true, marchandise: false, execution: true }
    default:
      return { releve: false, retrait: true, livraison: true, titreLivraison: 'Livraison', adresseExigee: true, marchandise: true, execution: true }
  }
}
