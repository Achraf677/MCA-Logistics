import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Rentabilite } from '../../features/rentabilite/Rentabilite'
import { Statistiques } from '../../features/statistiques/Statistiques'

/**
 * Domaine ANALYSES (Pilotage) — Rentabilité + Statistiques.
 * Dashboard reste une entrée séparée (page d'accueil, accès direct).
 */
export function AnalysesSection() {
  return (
    <Shell pageTitle="Analyses">
      <TabbedSection
        tabs={[
          { key: 'rentabilite', label: 'Rentabilité', element: <Rentabilite /> },
          { key: 'statistiques', label: 'Statistiques', element: <Statistiques /> },
        ]}
      />
    </Shell>
  )
}
