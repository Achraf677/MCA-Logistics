import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { Livraisons } from '../../features/livraisons/Livraisons'
import { Devis } from '../../features/devis/Devis'

export function LivraisonsSection() {
  return (
    <Shell pageTitle="Livraisons">
      <TabbedSection
        tabs={[
          { key: 'livraisons', label: 'Livraisons', element: <Livraisons /> },
          { key: 'devis', label: 'Devis', element: <Devis /> },
        ]}
      />
    </Shell>
  )
}
