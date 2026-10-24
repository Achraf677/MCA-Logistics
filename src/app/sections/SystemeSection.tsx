import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { useProfile } from '../../app/providers'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
// Les alertes ne sont plus un onglet : elles vivent dans la cloche du header (AlertesBell).
import { Parametres } from '../../features/parametres/Parametres'
import { Admins }     from '../../features/admins/Admins'
import { Documents }  from '../../features/documents/Documents'

/** Domaine SYSTÈME — Paramètres, Documents (Inbox, tri IA, bibliothèque) [+ Administrateurs si président]. */
export function SystemeSection() {
  const { profile } = useProfile()

  const tabs = [
    { key: 'parametres', label: 'Paramètres', element: <Parametres />, permKey: 'systeme.parametres' },
    { key: 'documents', label: 'Documents', element: <Documents />, permKey: 'systeme.documents' },
    ...(profile?.role === 'president'
      ? [{ key: 'administrateurs', label: 'Administrateurs', element: <Admins /> }]
      : []),
  ]

  return (
    <Shell pageTitle="Système">
      <TabbedSection tabs={tabs} />
    </Shell>
  )
}
