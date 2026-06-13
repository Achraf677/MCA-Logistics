export const features = {
  dashboard:    true,
  rentabilite:  true,
  statistiques: true,
  livraisons:   true,
  tournees:     true,
  planning:     true,
  calendrier:   true,
  incidents:    true,
  inspections:  true,
  vehicules:    true,
  carburant:    true,
  entretiens:   true,
  clients:      true,
  fournisseurs: true,
  charges:      true,
  encaissement: true,
  tresorerie:   true,
  tva:          true,
  equipe:       true,
  heures:       true,
  alertes:      true,
  parametres:   true,
  // Domaines à sous-onglets (réorganisation navigation)
  finance:      true,
} as const

export type FeatureKey = keyof typeof features
