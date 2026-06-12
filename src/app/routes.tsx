import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { Dashboard }    from '../features/dashboard/Dashboard'
import { Rentabilite }  from '../features/rentabilite/Rentabilite'
import { Statistiques } from '../features/statistiques/Statistiques'
import { Livraisons }   from '../features/livraisons/Livraisons'
import { Tournees }     from '../features/tournees/Tournees'
import { Planning }     from '../features/planning/Planning'
import { Calendrier }   from '../features/calendrier/Calendrier'
import { Incidents }    from '../features/incidents/Incidents'
import { Vehicules }    from '../features/vehicules/Vehicules'
import { Carburant }    from '../features/carburant/Carburant'
import { Entretiens }   from '../features/entretiens/Entretiens'
import { Clients }      from '../features/clients/Clients'
import { Fournisseurs } from '../features/fournisseurs/Fournisseurs'
import { FinanceSection } from './sections/FinanceSection'
import { Equipe }       from '../features/equipe/Equipe'
import { Heures }       from '../features/heures/Heures'
import { Inspections }  from '../features/inspections/Inspections'
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
      <Route path="/tournees"      element={guard(features.tournees,     <Tournees />)} />
      <Route path="/planning"      element={guard(features.planning,     <Planning />)} />
      <Route path="/calendrier"    element={guard(features.calendrier,   <Calendrier />)} />
      <Route path="/incidents"     element={guard(features.incidents,    <Incidents />)} />
      <Route path="/inspections"   element={guard(features.inspections,  <Inspections />)} />
      <Route path="/vehicules"     element={guard(features.vehicules,    <Vehicules />)} />
      <Route path="/carburant"     element={guard(features.carburant,    <Carburant />)} />
      <Route path="/entretiens"    element={guard(features.entretiens,   <Entretiens />)} />
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
