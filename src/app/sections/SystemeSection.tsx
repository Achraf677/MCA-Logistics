import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Alertes } from '../../features/alertes/Alertes'
import { Parametres } from '../../features/parametres/Parametres'
import { Documents } from '../../features/documents/Documents'

/** Domaine SYSTÈME — Alertes + Paramètres + Documents. */
export function SystemeSection() {
  return (
    <Shell pageTitle="Système">
      <TabbedSection
        tabs={[
          { key: 'alertes',    label: 'Alertes',    element: <Alertes /> },
          { key: 'documents',  label: 'Documents',  element: <Documents /> },
          { key: 'parametres', label: 'Paramètres', element: <Parametres /> },
        ]}
      />
    </Shell>
  )
}
