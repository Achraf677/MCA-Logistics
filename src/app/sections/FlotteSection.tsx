import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Vehicules } from '../../features/vehicules/Vehicules'
import { Carburant } from '../../features/carburant/Carburant'
import { Entretiens } from '../../features/entretiens/Entretiens'
import { Inspections } from '../../features/inspections/Inspections'
import { Incidents } from '../../features/incidents/Incidents'

/**
 * Domaine FLOTTE — page à sous-onglets regroupant 5 pages existantes.
 * Le Shell parent affiche la chrome (sidebar/topbar « Flotte ») ; chaque sous-vue
 * monte son propre Shell qui se rend en mode « imbriqué » (contenu + actions only).
 */
export function FlotteSection() {
  return (
    <Shell pageTitle="Flotte">
      <TabbedSection
        tabs={[
          { key: 'vehicules', label: 'Véhicules', element: <Vehicules /> },
          { key: 'carburant', label: 'Carburant', element: <Carburant /> },
          { key: 'entretiens', label: 'Entretiens', element: <Entretiens /> },
          { key: 'inspections', label: 'Inspections', element: <Inspections /> },
          { key: 'incidents', label: 'Incidents', element: <Incidents /> },
        ]}
      />
    </Shell>
  )
}
