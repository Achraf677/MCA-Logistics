import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Tresorerie } from '../../features/tresorerie/Tresorerie'
import { Charges } from '../../features/charges/Charges'
import { Encaissement } from '../../features/encaissement/Encaissement'
import { Tva } from '../../features/tva/Tva'
import { Relances } from '../../features/relances/Relances'

/**
 * Domaine FINANCE — page à sous-onglets regroupant 5 pages existantes.
 * Le Shell parent affiche la chrome (sidebar/topbar « Finance ») ; chaque sous-vue
 * monte son propre Shell qui se rend en mode « imbriqué » (contenu + actions only).
 */
export function FinanceSection() {
  return (
    <Shell pageTitle="Finance">
      <TabbedSection
        tabs={[
          { key: 'tresorerie', label: 'Trésorerie', element: <Tresorerie /> },
          { key: 'charges', label: 'Charges', element: <Charges /> },
          { key: 'encaissement', label: 'Encaissement', element: <Encaissement /> },
          { key: 'tva', label: 'TVA', element: <Tva /> },
          { key: 'relances', label: 'Relances', element: <Relances /> },
        ]}
      />
    </Shell>
  )
}
