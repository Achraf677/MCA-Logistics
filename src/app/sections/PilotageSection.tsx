import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { Dashboard } from '../../features/dashboard/Dashboard'
import { CalculateurRentabilite } from '../../features/rentabilite/CalculateurRentabilite'
import { Statistiques } from '../../features/statistiques/Statistiques'

/**
 * Domaine PILOTAGE — page à sous-onglets. Dashboard est le 1er onglet (défaut),
 * donc l'app s'ouvre toujours sur le Dashboard (route "/" rend cette section).
 */
export function PilotageSection() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (searchParams.get('tab') === 'simulateur') {
      navigate('/pilotage?tab=rentabilite', { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <Shell pageTitle="Pilotage">
      <TabbedSection
        tabs={[
          { key: 'dashboard',    label: 'Dashboard',    element: <Dashboard /> },
          { key: 'rentabilite',  label: 'Rentabilité',  element: <CalculateurRentabilite /> },
          { key: 'statistiques', label: 'Statistiques', element: <Statistiques /> },
        ]}
      />
    </Shell>
  )
}
