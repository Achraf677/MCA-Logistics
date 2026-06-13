import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Alertes } from '../../features/alertes/Alertes'
import { Parametres } from '../../features/parametres/Parametres'

/** Domaine SYSTÈME — Alertes + Paramètres. */
export function SystemeSection() {
  return (
    <Shell pageTitle="Système">
      <TabbedSection
        tabs={[
          { key: 'alertes', label: 'Alertes', element: <Alertes /> },
          { key: 'parametres', label: 'Paramètres', element: <Parametres /> },
        ]}
      />
    </Shell>
  )
}
