import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Dashboard } from '../../features/dashboard/Dashboard'
import { CalculateurRentabilite } from '../../features/rentabilite/CalculateurRentabilite'
import { Statistiques } from '../../features/statistiques/Statistiques'

/**
 * Domaine PILOTAGE — page à sous-onglets. Dashboard est le 1er onglet (défaut),
 * donc l'app s'ouvre toujours sur le Dashboard (route "/" rend cette section).
 */
export function PilotageSection() {
  return (
    <Shell pageTitle="Pilotage">
      <TabbedSection
        tabs={[
          { key: 'dashboard', label: 'Dashboard', element: <Dashboard /> },
          { key: 'rentabilite', label: 'Rentabilité', element: <CalculateurRentabilite /> },
          { key: 'statistiques', label: 'Statistiques', element: <Statistiques /> },
        ]}
      />
    </Shell>
  )
}
