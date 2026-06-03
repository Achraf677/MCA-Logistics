import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider, ProfileProvider, useAuth, useProfile, supabase } from './app/providers'
import { ToastProvider } from './shared/ui/useToast'
import { AppRoutes } from './app/routes'
import { LoginPage } from './app/LoginPage'
import { Button } from './shared/ui/Button'

// ── Garde profil ─────────────────────────────────────────────────────────────
// Bloque l'app si l'utilisateur authentifié n'a pas encore de ligne en profiles
function ProfileGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <span className="text-[var(--text-muted)] text-[var(--fs-sm)]">Chargement du profil…</span>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-sm text-center bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)] p-8 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-full bg-[var(--warning)]/15 flex items-center justify-center mx-auto">
            <span className="text-[var(--warning)] text-2xl">⚠</span>
          </div>
          <div>
            <h2 className="font-display font-semibold text-[var(--text)] text-lg mb-1">
              Profil non configuré
            </h2>
            <p className="text-[var(--text-muted)] text-[var(--fs-sm)]">
              Votre compte n'est pas encore associé à MCA Logistics.
              Contactez l'administrateur pour qu'il vous ajoute dans la base.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => supabase.auth.signOut()}
            className="mx-auto"
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// ── Core ─────────────────────────────────────────────────────────────────────
function AppCore() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <span className="text-[var(--text-muted)] text-[var(--fs-sm)]">Chargement…</span>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <ProfileProvider>
      <ProfileGate>
        <AppRoutes />
      </ProfileGate>
    </ProfileProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppCore />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
