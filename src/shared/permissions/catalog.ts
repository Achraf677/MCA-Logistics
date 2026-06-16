export interface PermResource {
  section: string
  key: string
  label: string
}

export const PERMISSION_CATALOG: PermResource[] = [
  // Pilotage
  { section: 'Pilotage',    key: 'pilotage.dashboard',    label: 'Tableau de bord' },
  { section: 'Pilotage',    key: 'pilotage.rentabilite',  label: 'Rentabilité' },
  { section: 'Pilotage',    key: 'pilotage.statistiques', label: 'Statistiques' },
  // Livraisons
  { section: 'Livraisons',  key: 'livraisons.livraisons', label: 'Livraisons' },
  { section: 'Livraisons',  key: 'livraisons.devis',      label: 'Devis' },
  { section: 'Livraisons',  key: 'livraisons.modeles',    label: 'Modèles' },
  // Planning
  { section: 'Planning',    key: 'planning.tournees',     label: 'Tournées' },
  { section: 'Planning',    key: 'planning.planning',     label: 'Planning' },
  { section: 'Planning',    key: 'planning.calendrier',   label: 'Calendrier' },
  // Flotte
  { section: 'Flotte',      key: 'flotte.vehicules',      label: 'Véhicules' },
  { section: 'Flotte',      key: 'flotte.carburant',      label: 'Carburant' },
  { section: 'Flotte',      key: 'flotte.entretiens',     label: 'Entretiens' },
  { section: 'Flotte',      key: 'flotte.inspections',    label: 'Inspections' },
  { section: 'Flotte',      key: 'flotte.incidents',      label: 'Incidents' },
  // Tiers
  { section: 'Tiers',       key: 'tiers.clients',         label: 'Clients' },
  { section: 'Tiers',       key: 'tiers.fournisseurs',    label: 'Fournisseurs' },
  // Finance
  { section: 'Finance',     key: 'finance.tresorerie',    label: 'Trésorerie' },
  { section: 'Finance',     key: 'finance.charges',       label: 'Charges' },
  { section: 'Finance',     key: 'finance.encaissement',  label: 'Encaissement' },
  { section: 'Finance',     key: 'finance.tva',           label: 'TVA' },
  { section: 'Finance',     key: 'finance.relances',      label: 'Relances' },
  // Équipe
  { section: 'Équipe',      key: 'equipe.membres',        label: 'Membres' },
  { section: 'Équipe',      key: 'equipe.heures',         label: 'Heures' },
  // Système
  { section: 'Système',     key: 'systeme.documents',     label: 'Documents' },
  { section: 'Système',     key: 'systeme.parametres',    label: 'Paramètres' },
]

/** Sections uniques dans l'ordre du catalogue. */
export const CATALOG_SECTIONS: string[] = [
  ...new Set(PERMISSION_CATALOG.map(r => r.section)),
]

/** Ressources groupées par section. */
export const CATALOG_BY_SECTION: Record<string, PermResource[]> =
  PERMISSION_CATALOG.reduce<Record<string, PermResource[]>>((acc, r) => {
    ;(acc[r.section] ??= []).push(r)
    return acc
  }, {})
