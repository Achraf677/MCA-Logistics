import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
// Les alertes ne sont plus un onglet : elles vivent dans la cloche du header (AlertesBell).
import { Parametres } from '../../features/parametres/Parametres'
import { Documents } from '../../features/documents/Documents'

/** Domaine SYSTÈME — Documents + Paramètres. */
export function SystemeSection() {
  return (
    <Shell pageTitle="Système">
      <TabbedSection
        tabs={[
          { key: 'documents',  label: 'Documents',  element: <Documents /> },
          { key: 'parametres', label: 'Paramètres', element: <Parametres /> },
        ]}
      />
    </Shell>
  )
}
