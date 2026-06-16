import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier EXISTANTES, réutilisées telles quelles (non modifiées).
import { Equipe } from '../../features/equipe/Equipe'
import { Heures } from '../../features/heures/Heures'

/**
 * Domaine ÉQUIPE — Membres + Heures.
 * Vit sur /equipe-hub (path distinct de l'ancien onglet /equipe, qui redirige vers
 * /equipe-hub?tab=membres — pas de boucle, section ≠ path redirigé).
 */
export function EquipeSection() {
  return (
    <Shell pageTitle="Équipe">
      <TabbedSection
        tabs={[
          { key: 'membres', label: 'Membres', element: <Equipe />, permKey: 'equipe.membres' },
          { key: 'heures',  label: 'Heures',  element: <Heures />, permKey: 'equipe.heures'  },
        ]}
      />
    </Shell>
  )
}
