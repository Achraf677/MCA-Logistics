import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { AuthCallback } from './AuthCallback'
import { PilotageSection }    from './sections/PilotageSection'
import { LivraisonsSection }  from './sections/LivraisonsSection'
import { FinanceSection }     from './sections/FinanceSection'
import { FlotteSection }   from './sections/FlotteSection'
import { PlanningSection } from './sections/PlanningSection'
import { TiersSection }    from './sections/TiersSection'
import { EquipeSection }   from './sections/EquipeSection'
import { SystemeSection }  from './sections/SystemeSection'

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Pilotage à sous-onglets ; "/" rend la section (1er onglet = Dashboard) → l'app ouvre sur le Dashboard.
          /pilotage ≠ paths redirigés → aucune boucle. */}
      <Route path="/"              element={<PilotageSection />} />
      <Route path="/pilotage"      element={guard(features.pilotage,     <PilotageSection />)} />
      <Route path="/dashboard"     element={<Navigate to="/pilotage?tab=dashboard"    replace />} />
      <Route path="/analyses"      element={<Navigate to="/pilotage"                  replace />} />
      <Route path="/rentabilite"   element={<Navigate to="/pilotage?tab=rentabilite"  replace />} />
      <Route path="/statistiques"  element={<Navigate to="/pilotage?tab=statistiques" replace />} />
      <Route path="/livraisons"    element={guard(features.livraisons,   <LivraisonsSection />)} />
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
      <Route path="/relances"      element={<Navigate to="/finance?tab=relances"    replace />} />
      <Route path="/devis"         element={<Navigate to="/livraisons?tab=devis"    replace />} />
      <Route path="/modeles"       element={<Navigate to="/livraisons?tab=modeles"  replace />} />
      <Route path="/documents"     element={<Navigate to="/systeme?tab=documents"   replace />} />
      {/* Domaine Équipe à sous-onglets (path /equipe-hub) ; anciennes routes → redirection.
          /equipe redirige vers /equipe-hub?tab=membres : pas de boucle (section ≠ path redirigé). */}
      <Route path="/equipe-hub"    element={guard(features.equipeHub,    <EquipeSection />)} />
      <Route path="/equipe"        element={<Navigate to="/equipe-hub?tab=membres" replace />} />
      <Route path="/heures"        element={<Navigate to="/equipe-hub?tab=heures"  replace />} />
      {/* Domaine Système à sous-onglets ; anciennes routes → redirection */}
      <Route path="/systeme"       element={guard(features.systeme,      <SystemeSection />)} />
      {/* Alertes : plus d'onglet — désormais une cloche dans le header. Ancien lien → dashboard. */}
      <Route path="/alertes"       element={<Navigate to="/" replace />} />
      <Route path="/parametres"    element={<Navigate to="/systeme?tab=parametres" replace />} />
      <Route path="/auth/callback"  element={<AuthCallback />} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}
