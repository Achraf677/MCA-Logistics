import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { Equipe } from '../../features/equipe/Equipe'

/**
 * Section « Équipe » : les membres (fiche, accès au site). Les anciens onglets À valider, Journées, Rapports et Heures
 * ont été supprimés le 24/10/2026 ; un onglet Documents (tous les fichiers, rangés et renommés par l'IA) viendra s'ajouter.
 * Vit sur /equipe-hub (path distinct de l'ancien onglet /equipe, qui redirige vers /equipe-hub?tab=membres).
 */
export function EquipeSection() {
  return (
    <Shell pageTitle="Équipe">
      <TabbedSection
        tabs={[
          { key: 'membres', label: 'Membres', element: <Equipe />, permKey: 'equipe.membres' },
        ]}
      />
    </Shell>
  )
}
