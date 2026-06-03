import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './Shell'
import { features } from '../features.config'
import { Dashboard }   from '../features/dashboard/Dashboard'
import { Clients }     from '../features/clients/Clients'
import { Fournisseurs } from '../features/fournisseurs/Fournisseurs'
import { Equipe }      from '../features/equipe/Equipe'
import { Vehicules }   from '../features/vehicules/Vehicules'
import { Livraisons }  from '../features/livraisons/Livraisons'
import { Planning }    from '../features/planning/Planning'
import { Carburant }   from '../features/carburant/Carburant'
import { Charges }     from '../features/charges/Charges'
import { Entretiens }  from '../features/entretiens/Entretiens'

function Placeholder({ title }: { title: string }) {
  return (
    <Shell pageTitle={title}>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--text-muted)]">
        <span className="text-[var(--fs-h2)] font-display">{title}</span>
        <span className="text-[var(--fs-sm)]">Onglet en cours de développement</span>
      </div>
    </Shell>
  )
}

function guard(enabled: boolean, element: React.ReactElement) {
  return enabled ? element : <Navigate to="/" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/rentabilite"   element={guard(features.rentabilite,  <Placeholder title="Rentabilité" />)} />
      <Route path="/statistiques"  element={guard(features.statistiques, <Placeholder title="Statistiques" />)} />
      <Route path="/livraisons"    element={guard(features.livraisons,   <Livraisons />)} />
      <Route path="/planning"      element={guard(features.planning,     <Planning />)} />
      <Route path="/calendrier"    element={guard(features.calendrier,   <Placeholder title="Calendrier" />)} />
      <Route path="/incidents"     element={guard(features.incidents,    <Placeholder title="Incidents" />)} />
      <Route path="/inspections"   element={guard(features.inspections,  <Placeholder title="Inspections" />)} />
      <Route path="/vehicules"     element={guard(features.vehicules,    <Vehicules />)} />
      <Route path="/carburant"     element={guard(features.carburant,    <Carburant />)} />
      <Route path="/entretiens"    element={guard(features.entretiens,   <Entretiens />)} />
      <Route path="/clients"       element={guard(features.clients,      <Clients />)} />
      <Route path="/fournisseurs"  element={guard(features.fournisseurs, <Fournisseurs />)} />
      <Route path="/charges"       element={guard(features.charges,      <Charges />)} />
      <Route path="/encaissement"  element={guard(features.encaissement, <Placeholder title="Encaissement" />)} />
      <Route path="/tva"           element={guard(features.tva,          <Placeholder title="TVA" />)} />
      <Route path="/equipe"        element={guard(features.equipe,       <Equipe />)} />
      <Route path="/heures"        element={guard(features.heures,       <Placeholder title="Heures" />)} />
      <Route path="/alertes"       element={guard(features.alertes,      <Placeholder title="Alertes" />)} />
      <Route path="/brouillons"    element={guard(features.brouillons,   <Placeholder title="Brouillons IA" />)} />
      <Route path="/parametres"    element={guard(features.parametres,   <Placeholder title="Paramètres" />)} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}
