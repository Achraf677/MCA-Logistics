import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Clients } from '../../features/clients/Clients'
import { Fournisseurs } from '../../features/fournisseurs/Fournisseurs'

/** Domaine TIERS — Clients + Fournisseurs. */
export function TiersSection() {
  return (
    <Shell pageTitle="Tiers">
      <TabbedSection
        tabs={[
          { key: 'clients', label: 'Clients', element: <Clients /> },
          { key: 'fournisseurs', label: 'Fournisseurs', element: <Fournisseurs /> },
        ]}
      />
    </Shell>
  )
}
