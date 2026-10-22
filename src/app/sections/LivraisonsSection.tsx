import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { Livraisons } from '../../features/livraisons/Livraisons'
import { Devis } from '../../features/devis/Devis'
import { DerniersNumeros } from '../../features/livraisons/DerniersNumeros'

export function LivraisonsSection() {
  return (
    <Shell pageTitle="Livraisons">
      <TabbedSection
        headerRight={<DerniersNumeros />}
        tabs={[
          { key: 'livraisons', label: 'Livraisons',        element: <Livraisons />,    permKey: 'livraisons.livraisons' },
          { key: 'devis',      label: 'Devis',             element: <Devis />,         permKey: 'livraisons.devis'      },
        ]}
      />
    </Shell>
  )
}
