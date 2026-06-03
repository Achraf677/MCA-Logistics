import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider, ProfileProvider, useAuth } from './app/providers'
import { ToastProvider } from './shared/ui/useToast'
import { AppRoutes } from './app/routes'
import { LoginPage } from './app/LoginPage'

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
      <AppRoutes />
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
