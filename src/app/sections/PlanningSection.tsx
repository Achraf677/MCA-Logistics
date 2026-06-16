import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Tournees } from '../../features/tournees/Tournees'
import { Planning } from '../../features/planning/Planning'
import { Calendrier } from '../../features/calendrier/Calendrier'

/**
 * Domaine PLANNING — page à sous-onglets regroupant les 3 vues temporelles.
 * Vit sur /planning-hub (path distinct de l'ancien onglet /planning, qui redirige
 * vers /planning-hub?tab=planning — pas de boucle, section ≠ path redirigé).
 * Clés de tab distinctes : tournees / planning / calendrier.
 */
export function PlanningSection() {
  return (
    <Shell pageTitle="Planning">
      <TabbedSection
        tabs={[
          { key: 'tournees',   label: 'Tournées',   element: <Tournees />,   permKey: 'planning.tournees'   },
          { key: 'planning',   label: 'Planning',   element: <Planning />,   permKey: 'planning.planning'   },
          { key: 'calendrier', label: 'Calendrier', element: <Calendrier />, permKey: 'planning.calendrier' },
        ]}
      />
    </Shell>
  )
}
