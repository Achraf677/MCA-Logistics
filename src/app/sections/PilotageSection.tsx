import { Navigate } from 'react-router-dom'
import { Shell } from '../Shell'
import { useProfile } from '../providers'
import { Dashboard } from '../../features/dashboard/Dashboard'

/**
 * Domaine PILOTAGE — un seul écran, Dashboard.
 *
 * Portait avant Rentabilité (simulateur manuel, jamais vraiment utilisé) et
 * Statistiques (CA mensuel + top clients) — retirés à la demande du
 * président : les deux redisaient ce que le Dashboard affiche déjà (même CA
 * mensuel, mêmes KPIs). Plus de sous-onglets à gérer : "/" rend directement
 * cette section, donc l'app s'ouvre toujours sur le Dashboard.
 */
export function PilotageSection() {
  const { profile, loading } = useProfile()
  // Un chauffeur n'a rien à faire ici (montants de la société) : son accueil
  // est Mes courses. Sans ça, il atterrissait sur un « CA HT du mois ».
  if (loading) return null
  if (profile?.role === 'chauffeur') return <Navigate to="/mes-courses" replace />
  return (
    <Shell pageTitle="Pilotage">
      <Dashboard />
    </Shell>
  )
}
