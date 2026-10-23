import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Tresorerie } from '../../features/tresorerie/Tresorerie'
import { Charges } from '../../features/charges/Charges'
import { Justificatifs } from '../../features/charges/Justificatifs'

/**
 * Domaine FINANCE — page à sous-onglets regroupant les pages Finance (Encaissement et Relances retirés le 22/10/2026).
 * Le Shell parent affiche la chrome (sidebar/topbar « Finance ») ; chaque sous-vue
 * monte son propre Shell qui se rend en mode « imbriqué » (contenu + actions only).
 */
export function FinanceSection() {
  return (
    <Shell pageTitle="Finance">
      <TabbedSection
        tabs={[
          { key: 'tresorerie',   label: 'Trésorerie',   element: <Tresorerie />,   permKey: 'finance.tresorerie'  },
          { key: 'charges',      label: 'Charges',      element: <Charges />,      permKey: 'finance.charges'     },
          { key: 'justificatifs', label: 'Justificatifs', element: <Justificatifs />, permKey: 'finance.charges'   },
        ]}
      />
    </Shell>
  )
}
