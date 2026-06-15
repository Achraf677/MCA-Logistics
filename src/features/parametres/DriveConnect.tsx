import { useEffect, useState } from 'react'
import { CheckCircle2, HardDrive } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'

const DRIVE_FLAG = 'mca_drive_connect'

export function DriveConnect() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

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

  useEffect(() => { refreshStatus() }, [])

  async function connect() {
    sessionStorage.setItem(DRIVE_FLAG, '1')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  if (loading) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">Vérification…</p>
    )
  }

  if (connected) {
    return (
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
    )
  }

  return (
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
  )
}
