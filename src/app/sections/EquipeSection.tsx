import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
// Sous-vues : pages métier de l'onglet Équipe.
import { Equipe } from '../../features/equipe/Equipe'
import { Heures } from '../../features/heures/Heures'
import { Comptes } from '../../features/equipe/Comptes'
import { usePermissions } from '../../shared/permissions/usePermissions'

/**
 * Domaine ÉQUIPE — Membres, Heures, Comptes (tous les comptes de connexion,
 * président seulement : l'Edge admin-users lui est réservée).
 * Vit sur /equipe-hub (path distinct de l'ancien onglet /equipe, qui redirige vers
 * /equipe-hub?tab=membres — pas de boucle, section ≠ path redirigé).
 */
export function EquipeSection() {
  const { isPresident } = usePermissions()
  return (
    <Shell pageTitle="Équipe">
      <TabbedSection
        tabs={[
          { key: 'membres', label: 'Membres', element: <Equipe />, permKey: 'equipe.membres' },
          { key: 'heures',  label: 'Heures',  element: <Heures />, permKey: 'equipe.heures'  },
          ...(isPresident ? [{ key: 'comptes', label: 'Comptes', element: <Comptes /> }] : []),
        ]}
      />
    </Shell>
  )
}
