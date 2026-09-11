import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { features } from '../features.config'
import { AuthCallback } from './AuthCallback'

// Sections chargées à la demande : chacune tire toutes les features de son domaine.
// En import statique, les 8 sections partaient dans un seul bundle chargé au
// démarrage, alors qu'on n'en affiche qu'une à la fois.
const PilotageSection   = lazy(() => import('./sections/PilotageSection').then(m => ({ default: m.PilotageSection })))
const LivraisonsSection = lazy(() => import('./sections/LivraisonsSection').then(m => ({ default: m.LivraisonsSection })))
const FinanceSection    = lazy(() => import('./sections/FinanceSection').then(m => ({ default: m.FinanceSection })))
const FlotteSection     = lazy(() => import('./sections/FlotteSection').then(m => ({ default: m.FlotteSection })))
const PlanningSection   = lazy(() => import('./sections/PlanningSection').then(m => ({ default: m.PlanningSection })))
const TiersSection      = lazy(() => import('./sections/TiersSection').then(m => ({ default: m.TiersSection })))
const EquipeSection     = lazy(() => import('./sections/EquipeSection').then(m => ({ default: m.EquipeSection })))
const MesCourses        = lazy(() => import('../features/mescourses/MesCourses').then(m => ({ default: m.MesCourses })))
const SystemeSection    = lazy(() => import('./sections/SystemeSection').then(m => ({ default: m.SystemeSection })))

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--fs-sm)] text-[var(--text-muted)]">Chargement…</div>}>
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
      {/* Ecran chauffeur : volontairement hors des sections a sous-onglets. */}
      <Route path="/mes-courses"   element={guard(features.mesCourses,   <MesCourses />)} />
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
    </Suspense>
  )
}
