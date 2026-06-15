import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from './providers'

const DRIVE_FLAG = 'mca_drive_connect'

export function AuthCallback() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Connexion Drive en cours ? → capter le provider_refresh_token et le stocker.
      if (sessionStorage.getItem(DRIVE_FLAG) === '1') {
        sessionStorage.removeItem(DRIVE_FLAG)
        const { data: { session } } = await supabase.auth.getSession()
        const refresh = session?.provider_refresh_token
        if (refresh) {
          try {
            await supabase.functions.invoke('drive-connect', {
              body: { refresh_token: refresh, email: session?.user?.email ?? null },
            })
          } catch {
            // L'échec restera visible via drive-status dans Paramètres ; on ne bloque pas la nav.
          }
        }
      }
      if (!cancelled) setDone(true)
    })()
    return () => { cancelled = true }
  }, [])

  if (done) return <Navigate to="/" replace />
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
      Finalisation de la connexion…
    </div>
  )
}
