import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { Dashboard }    from '../features/dashboard/Dashboard'
import { Rentabilite }  from '../features/rentabilite/Rentabilite'
import { Statistiques } from '../features/statistiques/Statistiques'
import { Livraisons }   from '../features/livraisons/Livraisons'
import { Clients }      from '../features/clients/Clients'
import { Fournisseurs } from '../features/fournisseurs/Fournisseurs'
import { FinanceSection } from './sections/FinanceSection'
import { FlotteSection }  from './sections/FlotteSection'
import { PlanningSection } from './sections/PlanningSection'
import { Equipe }       from '../features/equipe/Equipe'
import { Heures }       from '../features/heures/Heures'
import { Alertes }      from '../features/alertes/Alertes'
import { Parametres }   from '../features/parametres/Parametres'

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/rentabilite"   element={guard(features.rentabilite,  <Rentabilite />)} />
      <Route path="/statistiques"  element={guard(features.statistiques, <Statistiques />)} />
      <Route path="/livraisons"    element={guard(features.livraisons,   <Livraisons />)} />
      {/* Domaine Planning à sous-onglets (path /planning-hub) ; anciennes routes → redirection.
          /planning redirige vers /planning-hub?tab=planning : pas de boucle (section ≠ path redirigé). */}
      <Route path="/planning-hub"  element={guard(features.planningHub,  <PlanningSection />)} />
      <Route path="/tournees"      element={<Navigate to="/planning-hub?tab=tournees"   replace />} />
      <Route path="/planning"      element={<Navigate to="/planning-hub?tab=planning"   replace />} />
      <Route path="/calendrier"    element={<Navigate to="/planning-hub?tab=calendrier" replace />} />
      {/* Domaine Flotte à sous-onglets ; anciennes routes → redirection (liens préservés) */}
      <Route path="/flotte"        element={guard(features.flotte,       <FlotteSection />)} />
      <Route path="/vehicules"     element={<Navigate to="/flotte?tab=vehicules"   replace />} />
      <Route path="/carburant"     element={<Navigate to="/flotte?tab=carburant"   replace />} />
      <Route path="/entretiens"    element={<Navigate to="/flotte?tab=entretiens"  replace />} />
      <Route path="/inspections"   element={<Navigate to="/flotte?tab=inspections" replace />} />
      <Route path="/incidents"     element={<Navigate to="/flotte?tab=incidents"   replace />} />
      <Route path="/clients"       element={guard(features.clients,      <Clients />)} />
      <Route path="/fournisseurs"  element={guard(features.fournisseurs, <Fournisseurs />)} />
      {/* Domaine Finance à sous-onglets ; anciennes routes → redirection (liens préservés) */}
      <Route path="/finance"       element={guard(features.finance,      <FinanceSection />)} />
      <Route path="/charges"       element={<Navigate to="/finance?tab=charges"     replace />} />
      <Route path="/encaissement"  element={<Navigate to="/finance?tab=encaissement" replace />} />
      <Route path="/tresorerie"    element={<Navigate to="/finance?tab=tresorerie"  replace />} />
      <Route path="/tva"           element={<Navigate to="/finance?tab=tva"         replace />} />
      <Route path="/equipe"        element={guard(features.equipe,       <Equipe />)} />
      <Route path="/heures"        element={guard(features.heures,       <Heures />)} />
      <Route path="/alertes"       element={guard(features.alertes,      <Alertes />)} />
      <Route path="/parametres"    element={guard(features.parametres,   <Parametres />)} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}
