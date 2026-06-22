import { useState } from 'react'
import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { useToast } from './useToast'

interface SyncButtonProps {
  label: string
  onSync: () => Promise<{ ok: boolean; message?: string }>
  lastSyncAt?: string | null
  variant?: 'primary' | 'secondary'
  icon?: ReactNode
}

export function SyncButton({
  label,
  onSync,
  lastSyncAt,
  variant = 'secondary',
  icon,
}: SyncButtonProps) {
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    try {
      const result = await onSync()
      if (!result.ok) {
        toast(result.message ?? 'Échec de la synchronisation', 'error')
      } else {
        toast(result.message ?? 'Synchronisé')
      }
    } catch (e) {
      toast((e as Error).message ?? 'Erreur inattendue', 'error')
    } finally {
      setPending(false)
    }
  }

  const formattedDate = lastSyncAt
    ? new Date(lastSyncAt).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  const iconEl = pending
    ? <RefreshCw size={13} className="animate-spin" />
    : (icon ?? <RefreshCw size={13} />)

  return (
    <div className="flex items-center gap-2">
      {formattedDate && (
        <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] hidden sm:inline">
          {formattedDate}
        </span>
      )}
      <Button variant={variant} size="compact" onClick={handleClick} disabled={pending}>
        {iconEl}
        <span className="hidden sm:inline">{label}</span>
      </Button>
    </div>
  )
}
