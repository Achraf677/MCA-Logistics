import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { Dashboard }    from '../features/dashboard/Dashboard'
import { Livraisons }   from '../features/livraisons/Livraisons'
import { FinanceSection }  from './sections/FinanceSection'
import { FlotteSection }   from './sections/FlotteSection'
import { PlanningSection } from './sections/PlanningSection'
import { AnalysesSection } from './sections/AnalysesSection'
import { TiersSection }    from './sections/TiersSection'
import { EquipeSection }   from './sections/EquipeSection'
import { Alertes }      from '../features/alertes/Alertes'
import { Parametres }   from '../features/parametres/Parametres'

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      {/* Pilotage : Dashboard reste séparé ; Rentabilité + Statistiques → /analyses */}
      <Route path="/analyses"      element={guard(features.analyses,     <AnalysesSection />)} />
      <Route path="/rentabilite"   element={<Navigate to="/analyses?tab=rentabilite"  replace />} />
      <Route path="/statistiques"  element={<Navigate to="/analyses?tab=statistiques" replace />} />
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
      {/* Domaine Tiers à sous-onglets ; anciennes routes → redirection */}
      <Route path="/tiers"         element={guard(features.tiers,        <TiersSection />)} />
      <Route path="/clients"       element={<Navigate to="/tiers?tab=clients"      replace />} />
      <Route path="/fournisseurs"  element={<Navigate to="/tiers?tab=fournisseurs" replace />} />
      {/* Domaine Finance à sous-onglets ; anciennes routes → redirection (liens préservés) */}
      <Route path="/finance"       element={guard(features.finance,      <FinanceSection />)} />
      <Route path="/charges"       element={<Navigate to="/finance?tab=charges"     replace />} />
      <Route path="/encaissement"  element={<Navigate to="/finance?tab=encaissement" replace />} />
      <Route path="/tresorerie"    element={<Navigate to="/finance?tab=tresorerie"  replace />} />
      <Route path="/tva"           element={<Navigate to="/finance?tab=tva"         replace />} />
      {/* Domaine Équipe à sous-onglets (path /equipe-hub) ; anciennes routes → redirection.
          /equipe redirige vers /equipe-hub?tab=membres : pas de boucle (section ≠ path redirigé). */}
      <Route path="/equipe-hub"    element={guard(features.equipeHub,    <EquipeSection />)} />
      <Route path="/equipe"        element={<Navigate to="/equipe-hub?tab=membres" replace />} />
      <Route path="/heures"        element={<Navigate to="/equipe-hub?tab=heures"  replace />} />
      <Route path="/alertes"       element={guard(features.alertes,      <Alertes />)} />
      <Route path="/parametres"    element={guard(features.parametres,   <Parametres />)} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}
