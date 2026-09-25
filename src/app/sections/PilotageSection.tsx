import { Shell } from '../Shell'
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
  return (
    <Shell pageTitle="Pilotage">
      <Dashboard />
    </Shell>
  )
}
