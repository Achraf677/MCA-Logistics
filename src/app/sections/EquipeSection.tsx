import { useCallback, useEffect, useState } from 'react'
import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { compterJourneesAValider } from '../../shared/lib/journeesColis.queries'
// Sous-vues : pages métier de l'onglet Équipe.
import { Equipe } from '../../features/equipe/Equipe'
import { Heures } from '../../features/heures/Heures'
import { ValidationJournees } from '../../features/equipe/ValidationJournees'

/**
 * Domaine ÉQUIPE — Membres, journées de colis (à valider, consultation, rapports), Heures.
 * Vit sur /equipe-hub (path distinct de l'ancien onglet /equipe, qui redirige vers
 * /equipe-hub?tab=membres — pas de boucle, section ≠ path redirigé).
 * Les onglets des journées exigent le droit `equipe.journees` (vue) ; les gestes, `update`
 * ou `delete` (vérifiés dans chaque écran, et par la base).
 */
export function EquipeSection() {
  const { ready, can } = usePermissions()
  const voitJournees = ready && can('equipe.journees', 'view')
  const [aValider, setAValider] = useState(0)

  const compter = useCallback(() => {
    if (!voitJournees) return
    compterJourneesAValider().then(setAValider).catch(() => setAValider(0))
  }, [voitJournees])

  useEffect(() => { compter() }, [compter])

  return (
    <Shell pageTitle="Équipe">
      <TabbedSection
        tabs={[
          { key: 'membres', label: 'Membres', element: <Equipe />, permKey: 'equipe.membres' },
          {
            key: 'a-valider', label: aValider > 0 ? `À valider (${aValider})` : 'À valider',
            element: <ValidationJournees onChange={compter} />, permKey: 'equipe.journees',
          },
          { key: 'heures',  label: 'Heures',  element: <Heures />, permKey: 'equipe.heures'  },
        ]}
      />
    </Shell>
  )
}
