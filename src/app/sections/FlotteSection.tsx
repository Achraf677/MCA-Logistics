import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Vehicules } from '../../features/vehicules/Vehicules'
import { Carburant } from '../../features/carburant/Carburant'
import { Entretiens } from '../../features/entretiens/Entretiens'

/**
 * Domaine FLOTTE — page à sous-onglets regroupant 3 pages existantes.
 * Le Shell parent affiche la chrome (sidebar/topbar « Flotte ») ; chaque sous-vue
 * monte son propre Shell qui se rend en mode « imbriqué » (contenu + actions only).
 */
export function FlotteSection() {
  return (
    <Shell pageTitle="Flotte">
      <TabbedSection
        tabs={[
          { key: 'vehicules',   label: 'Véhicules',   element: <Vehicules />,   permKey: 'flotte.vehicules'   },
          { key: 'carburant',   label: 'Carburant & consommables', element: <Carburant />,   permKey: 'flotte.carburant'   },
          { key: 'entretiens',  label: 'Entretiens',  element: <Entretiens />,  permKey: 'flotte.entretiens'  },
        ]}
      />
    </Shell>
  )
}
