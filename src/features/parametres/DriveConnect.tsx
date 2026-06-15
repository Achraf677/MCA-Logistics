import { useEffect, useState } from 'react'
import { CheckCircle2, HardDrive } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'

export function DriveConnect() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refreshStatus() {
    setLoading(true)
    try {
      const { data } = await supabase.functions.invoke('drive-status')
      setConnected(!!data?.connected)
      setEmail(data?.email ?? null)
    } catch {
      setConnected(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const drive = p.get('drive')
    if (drive) {
      window.history.replaceState({}, '', '/systeme?tab=parametres')
      if (drive === 'error') {
        setError(`Connexion Drive échouée (${p.get('reason') ?? 'inconnu'})`)
      }
    }
    refreshStatus()
  }, [])

  async function connect() {
    setError(null)
    const { data, error: invokeError } = await supabase.functions.invoke('drive-oauth-start', {
      body: { origin: window.location.origin },
    })
    if (invokeError || !data?.url) {
      setError('Impossible de démarrer la connexion Drive')
      return
    }
    window.location.href = data.url
  }

  if (loading) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">Vérification…</p>
    )
  }

  if (connected) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-[var(--success,#16a34a)] shrink-0" />
            <div>
              <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Drive connecté</p>
              {email && (
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">{email}</p>
              )}
            </div>
          </div>
          <Button variant="secondary" size="compact" onClick={connect}>
            Reconnecter
          </Button>
        </div>
        {error && (
          <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <HardDrive size={18} className="text-[var(--text-muted)] shrink-0" />
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
            Aucun Drive connecté — les documents seront uploadés dans le Google Drive de la société.
          </p>
        </div>
        <Button variant="primary" size="compact" onClick={connect} className="shrink-0">
          Connecter Google Drive
        </Button>
      </div>
      {error && (
        <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{error}</p>
      )}
    </div>
  )
}
