import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { Dashboard }    from '../features/dashboard/Dashboard'
import { Rentabilite }  from '../features/rentabilite/Rentabilite'
import { Statistiques } from '../features/statistiques/Statistiques'
import { Livraisons }   from '../features/livraisons/Livraisons'
import { Planning }     from '../features/planning/Planning'
import { Calendrier }   from '../features/calendrier/Calendrier'
import { Incidents }    from '../features/incidents/Incidents'
import { Vehicules }    from '../features/vehicules/Vehicules'
import { Carburant }    from '../features/carburant/Carburant'
import { Entretiens }   from '../features/entretiens/Entretiens'
import { Clients }      from '../features/clients/Clients'
import { Fournisseurs } from '../features/fournisseurs/Fournisseurs'
import { Charges }      from '../features/charges/Charges'
import { Encaissement } from '../features/encaissement/Encaissement'
import { Tresorerie }   from '../features/tresorerie/Tresorerie'
import { Tva }          from '../features/tva/Tva'
import { Equipe }       from '../features/equipe/Equipe'
import { Heures }       from '../features/heures/Heures'
import { Inspections }  from '../features/inspections/Inspections'
import { Alertes }      from '../features/alertes/Alertes'
import { BrouillonsIA } from '../features/brouillons/BrouillonsIA'
import { CopiloteIA }   from '../features/copilote/CopiloteIA'
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
      <Route path="/planning"      element={guard(features.planning,     <Planning />)} />
      <Route path="/calendrier"    element={guard(features.calendrier,   <Calendrier />)} />
      <Route path="/incidents"     element={guard(features.incidents,    <Incidents />)} />
      <Route path="/inspections"   element={guard(features.inspections,  <Inspections />)} />
      <Route path="/vehicules"     element={guard(features.vehicules,    <Vehicules />)} />
      <Route path="/carburant"     element={guard(features.carburant,    <Carburant />)} />
      <Route path="/entretiens"    element={guard(features.entretiens,   <Entretiens />)} />
      <Route path="/clients"       element={guard(features.clients,      <Clients />)} />
      <Route path="/fournisseurs"  element={guard(features.fournisseurs, <Fournisseurs />)} />
      <Route path="/charges"       element={guard(features.charges,      <Charges />)} />
      <Route path="/encaissement"  element={guard(features.encaissement, <Encaissement />)} />
      <Route path="/tresorerie"    element={guard(features.tresorerie,   <Tresorerie />)} />
      <Route path="/tva"           element={guard(features.tva,          <Tva />)} />
      <Route path="/equipe"        element={guard(features.equipe,       <Equipe />)} />
      <Route path="/heures"        element={guard(features.heures,       <Heures />)} />
      <Route path="/alertes"       element={guard(features.alertes,      <Alertes />)} />
      <Route path="/brouillons"    element={guard(features.brouillons,   <BrouillonsIA />)} />
      <Route path="/copilote"      element={guard(features.copilote,     <CopiloteIA />)} />
      <Route path="/parametres"    element={guard(features.parametres,   <Parametres />)} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}
