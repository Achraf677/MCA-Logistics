import React, { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { features } from '../features.config'
import { AuthCallback } from './AuthCallback'
import { supabase } from './providers'
import { DefinirMotDePasse } from './DefinirMotDePasse'

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

/**
 * Redirection d'une ancienne route vers son onglet, EN CONSERVANT les
 * paramètres d'URL.
 *
 * `<Navigate to="/finance?tab=charges">` les jetait : une alerte de la cloche
 * pointant sur `/charges?filtre=hors_pennylane` arrivait bien sur l'onglet
 * Charges, mais sans son filtre — l'utilisateur voyait la liste complète et
 * devait retrouver à la main ce que l'alerte lui signalait. Le défaut touchait
 * les 20 anciennes routes, dont celle des factures supprimées de Pennylane,
 * en place depuis bien avant.
 */
function VersOnglet({ section, tab }: { section: string; tab: string }) {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('tab', tab)
  return <Navigate to={`${section}?${params.toString()}`} replace />
}

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

/**
 * Filet de securite pour les liens de reinitialisation.
 *
 * Le chemin normal passe par `/auth/callback`, qui lit le fragment d'URL et
 * oriente. Mais si l'URL de redirection du projet Supabase n'a pas ete mise a
 * jour, le lien retombe sur la racine du site : la session de recuperation
 * s'ouvre et le salarie se retrouve dans l'application, toujours sans mot de
 * passe. On ecoute donc l'evenement lui-meme, quel que soit l'ecran d'arrivee.
 *
 * Pas de redirection si on y est deja, sinon la navigation se repete.
 */
function RecuperationMotDePasse() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement === 'PASSWORD_RECOVERY' && pathname !== '/definir-mot-de-passe') {
        navigate('/definir-mot-de-passe', { replace: true })
      }
    })
    return () => data.subscription.unsubscribe()
  }, [navigate, pathname])

  return null
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--fs-sm)] text-[var(--text-muted)]">Chargement…</div>}>
    <RecuperationMotDePasse />
    <Routes>
      {/* Pilotage à sous-onglets ; "/" rend la section (1er onglet = Dashboard) → l'app ouvre sur le Dashboard.
          /pilotage ≠ paths redirigés → aucune boucle. */}
      <Route path="/"              element={<PilotageSection />} />
      <Route path="/pilotage"      element={guard(features.pilotage,     <PilotageSection />)} />
      <Route path="/dashboard"  element={<VersOnglet section="/pilotage" tab="dashboard" />} />
      <Route path="/analyses"      element={<Navigate to="/pilotage"                  replace />} />
      <Route path="/rentabilite" element={<VersOnglet section="/pilotage" tab="rentabilite" />} />
      <Route path="/statistiques" element={<VersOnglet section="/pilotage" tab="statistiques" />} />
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
      <Route path="/vehicules"  element={<VersOnglet section="/flotte" tab="vehicules" />} />
      <Route path="/carburant"  element={<VersOnglet section="/flotte" tab="carburant" />} />
      <Route path="/entretiens" element={<VersOnglet section="/flotte" tab="entretiens" />} />
      <Route path="/inspections" element={<VersOnglet section="/flotte" tab="inspections" />} />
      <Route path="/incidents"  element={<VersOnglet section="/flotte" tab="incidents" />} />
      {/* Domaine Tiers à sous-onglets ; anciennes routes → redirection */}
      <Route path="/tiers"         element={guard(features.tiers,        <TiersSection />)} />
      <Route path="/clients"    element={<VersOnglet section="/tiers" tab="clients" />} />
      <Route path="/fournisseurs" element={<VersOnglet section="/tiers" tab="fournisseurs" />} />
      {/* Domaine Finance à sous-onglets ; anciennes routes → redirection (liens préservés) */}
      <Route path="/finance"       element={guard(features.finance,      <FinanceSection />)} />
      <Route path="/charges"    element={<VersOnglet section="/finance" tab="charges" />} />
      <Route path="/encaissement" element={<VersOnglet section="/finance" tab="encaissement" />} />
      <Route path="/tresorerie" element={<VersOnglet section="/finance" tab="tresorerie" />} />
      <Route path="/tva"        element={<VersOnglet section="/finance" tab="tva" />} />
      <Route path="/relances"   element={<VersOnglet section="/finance" tab="relances" />} />
      <Route path="/devis"      element={<VersOnglet section="/livraisons" tab="devis" />} />
      <Route path="/modeles"    element={<VersOnglet section="/livraisons" tab="modeles" />} />
      {/* Domaine Équipe à sous-onglets (path /equipe-hub) ; anciennes routes → redirection.
          /equipe redirige vers /equipe-hub?tab=membres : pas de boucle (section ≠ path redirigé). */}
      <Route path="/equipe-hub"    element={guard(features.equipeHub,    <EquipeSection />)} />
      <Route path="/equipe"        element={<Navigate to="/equipe-hub?tab=membres" replace />} />
      <Route path="/heures"        element={<Navigate to="/equipe-hub?tab=heures"  replace />} />
      {/* Domaine Système à sous-onglets ; anciennes routes → redirection */}
      <Route path="/systeme"       element={guard(features.systeme,      <SystemeSection />)} />
      {/* Alertes : plus d'onglet — désormais une cloche dans le header. Ancien lien → dashboard. */}
      <Route path="/alertes"       element={<Navigate to="/" replace />} />
      <Route path="/parametres" element={<VersOnglet section="/systeme" tab="parametres" />} />
      <Route path="/auth/callback"  element={<AuthCallback />} />
      {/* Cible des liens de reinitialisation envoyes par e-mail. Route publique :
          la session n'existe qu'une fois les jetons de l'URL echanges, donc
          elle ne peut pas etre derriere le garde d'authentification. */}
      <Route path="/definir-mot-de-passe" element={<DefinirMotDePasse />} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
