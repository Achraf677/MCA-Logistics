import { Navigate, useSearchParams } from 'react-router-dom'
import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Tournees } from '../../features/tournees/Tournees'
import { Planning } from '../../features/planning/Planning'

/**
 * Domaine PLANNING — Tournées (composer / optimiser) et Planning (semaine par
 * chauffeur, par jour, et mois : l'ancien Calendrier, fondu le 01/10/2026).
 * Vit sur /planning-hub (path distinct de l'ancien onglet /planning, qui redirige
 * vers /planning-hub?tab=planning — pas de boucle, section ≠ path redirigé).
 * Ancien lien ?tab=calendrier → Planning, vue Mois.
 */
export function PlanningSection() {
  const [params] = useSearchParams()
  if (params.get('tab') === 'calendrier') return <Navigate to="/planning-hub?tab=planning&vue=mois" replace />
  return (
    <Shell pageTitle="Planning">
      <TabbedSection
        tabs={[
          { key: 'tournees',   label: 'Tournées',   element: <Tournees />,   permKey: 'planning.tournees'   },
          { key: 'planning',   label: 'Planning',   element: <Planning />,   permKey: 'planning.planning'   },
        ]}
      />
    </Shell>
  )
}
