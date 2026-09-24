import { useEffect, lazy } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Shell } from '../Shell'
import { TabbedSection } from '../../shared/ui/TabbedSection'
import { Dashboard } from '../../features/dashboard/Dashboard'

// Chargés à la demande : Dashboard est le 1er onglet (celui de la page
// d'accueil), Rentabilité et Statistiques n'ouvrent leurs graphiques
// (recharts) et leur carte (leaflet) qu'au clic sur leur onglet. En import
// statique, ces librairies (~300 Ko) étaient téléchargées dès l'ouverture du
// site, même pour ne regarder que le Dashboard.
const CalculateurRentabilite = lazy(() =>
  import('../../features/rentabilite/CalculateurRentabilite').then(m => ({ default: m.CalculateurRentabilite })))
const Statistiques = lazy(() =>
  import('../../features/statistiques/Statistiques').then(m => ({ default: m.Statistiques })))

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
          { key: 'dashboard',    label: 'Dashboard',    element: <Dashboard />,                permKey: 'pilotage.dashboard'    },
          { key: 'rentabilite',  label: 'Rentabilité',  element: <CalculateurRentabilite />,   permKey: 'pilotage.rentabilite'  },
          { key: 'statistiques', label: 'Statistiques', element: <Statistiques />,             permKey: 'pilotage.statistiques' },
        ]}
      />
    </Shell>
  )
}
